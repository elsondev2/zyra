import type {
    ForegroundRouteClaim,
    RealtimeContinuitySource,
    RealtimeHydrationDelta,
    RealtimeHydrationItem,
    RealtimeHydrationSeed,
    RealtimeHydrationWatermarks
} from '../../../shared/assistant/contracts'
import type { ForegroundClock } from '../foreground/foreground-route-controller'
import { systemForegroundClock } from '../foreground/foreground-route-controller'
import { createRealtimeHydrationDelta, createRealtimeHydrationSeed } from './realtime-hydration'

interface FakeContinuityConversation {
    contextVersion: number
    watermarks: RealtimeHydrationWatermarks
    items: RealtimeHydrationItem[]
    retrievalReferenceIds: string[]
    packetOrdinal: number
    deltaOrdinal: number
}

const zeroWatermarks = (): RealtimeHydrationWatermarks => ({
    conversation: 0,
    foregroundRoutes: 1,
    context: 0,
    tasks: 0,
    operations: 0,
    narration: 0
})

export class FakeRealtimeContinuitySource implements RealtimeContinuitySource {
    private readonly conversations = new Map<string, FakeContinuityConversation>()

    constructor(private readonly clock: ForegroundClock = systemForegroundClock) {}

    initialize(conversationId: string, contextVersion = 0): void {
        if (this.conversations.has(conversationId)) return
        this.conversations.set(conversationId, {
            contextVersion,
            watermarks: { ...zeroWatermarks(), context: contextVersion },
            items: [],
            retrievalReferenceIds: [],
            packetOrdinal: 0,
            deltaOrdinal: 0
        })
    }

    appendMessage(input: {
        conversationId: string
        messageId: string
        role: 'user' | 'assistant'
        text: string
        modality?: 'text' | 'voice' | 'image'
    }): void {
        const conversation = this.requireConversation(input.conversationId)
        const sequence = ++conversation.watermarks.conversation
        conversation.items.push({
            itemId: `context_message_${input.messageId}`,
            role: input.role,
            text: input.text,
            canonicalMessageId: input.messageId,
            conversationSequence: sequence,
            modality: input.modality || 'text'
        })
    }

    appendTaskSummary(conversationId: string, taskId: string, text: string): void {
        const conversation = this.requireConversation(conversationId)
        conversation.watermarks.tasks += 1
        conversation.items.push({
            itemId: `context_task_${taskId}_${conversation.watermarks.tasks}`,
            role: 'developer',
            text,
            canonicalMessageId: null,
            conversationSequence: null,
            modality: 'system'
        })
    }

    advanceContext(conversationId: string, contextVersion: number, text: string): void {
        const conversation = this.requireConversation(conversationId)
        if (contextVersion !== conversation.contextVersion + 1) throw new Error('Fake context revisions must be contiguous.')
        conversation.contextVersion = contextVersion
        conversation.watermarks.context = contextVersion
        conversation.items.push({
            itemId: `context_revision_${contextVersion}`,
            role: 'developer',
            text,
            canonicalMessageId: null,
            conversationSequence: null,
            modality: 'system'
        })
    }

    setRetrievalReferences(conversationId: string, referenceIds: string[]): void {
        this.requireConversation(conversationId).retrievalReferenceIds = [...referenceIds]
    }

    async materialize(conversationId: string, routeClaim: ForegroundRouteClaim): Promise<RealtimeHydrationSeed> {
        const conversation = this.requireConversation(conversationId)
        const packetOrdinal = ++conversation.packetOrdinal
        return createRealtimeHydrationSeed({
            packetId: `packet_${conversationId}_${packetOrdinal}`,
            conversationId,
            contextVersion: conversation.contextVersion,
            activeRouteClaim: routeClaim,
            sourceWatermarks: conversation.watermarks,
            items: conversation.items,
            retrievalReferenceIds: conversation.retrievalReferenceIds,
            generatedAt: this.clock.now()
        })
    }

    async deltaAfter(
        seed: RealtimeHydrationSeed,
        current: RealtimeHydrationWatermarks
    ): Promise<RealtimeHydrationDelta | null> {
        const conversation = this.requireConversation(seed.conversationId)
        const target = conversation.watermarks
        if (watermarksEqual(current, target)) return null
        assertNotAhead(current, target)
        const items = conversation.items.filter((item) => {
            if (item.conversationSequence !== null) return item.conversationSequence > current.conversation
            const taskSuffix = item.itemId.match(/_(\d+)$/)?.[1]
            if (item.itemId.startsWith('context_task_')) return Number(taskSuffix || 0) > current.tasks
            if (item.itemId.startsWith('context_revision_')) return Number(taskSuffix || 0) > current.context
            return true
        })
        return createRealtimeHydrationDelta({
            deltaId: `delta_${seed.conversationId}_${++conversation.deltaOrdinal}`,
            basePacketId: seed.packetId,
            conversationId: seed.conversationId,
            fromWatermarks: current,
            toWatermarks: target,
            items,
            generatedAt: this.clock.now()
        })
    }

    currentWatermarks(conversationId: string): RealtimeHydrationWatermarks {
        return structuredClone(this.requireConversation(conversationId).watermarks)
    }

    private requireConversation(conversationId: string): FakeContinuityConversation {
        const conversation = this.conversations.get(conversationId)
        if (!conversation) throw new Error(`Unknown fake continuity conversation ${conversationId}.`)
        return conversation
    }
}

function watermarksEqual(left: RealtimeHydrationWatermarks, right: RealtimeHydrationWatermarks): boolean {
    return left.conversation === right.conversation
        && left.foregroundRoutes === right.foregroundRoutes
        && left.context === right.context
        && left.tasks === right.tasks
        && left.operations === right.operations
        && left.narration === right.narration
}

function assertNotAhead(current: RealtimeHydrationWatermarks, target: RealtimeHydrationWatermarks): void {
    for (const key of Object.keys(current) as Array<keyof RealtimeHydrationWatermarks>) {
        if (current[key] > target[key]) throw new Error(`Continuity consumer is ahead of canonical ${key} state.`)
    }
}
