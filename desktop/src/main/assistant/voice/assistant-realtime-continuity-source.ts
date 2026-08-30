import { createHash } from 'node:crypto'
import type {
    ForegroundRouteClaim,
    RealtimeContinuitySource,
    RealtimeHydrationDelta,
    RealtimeHydrationItem,
    RealtimeHydrationSeed
} from '../../../shared/assistant/contracts'
import { createRealtimeHydrationSeed } from './realtime-hydration'

const MAX_CONTEXT_MESSAGES = 20
const MAX_CONTEXT_CHARACTERS = 22_000
const MAX_ITEM_CHARACTERS = 4_000

export interface AssistantContinuitySnapshot {
    contextVersion: number
    routeCount: number
    messages: Array<{
        id: string
        role: 'user' | 'assistant'
        text: string
        modality?: 'text' | 'voice' | 'image'
        sequence?: number | null
    }>
    pendingApprovals: Array<{ id: string; title?: string; detail?: string }>
    pendingInputs: Array<{ id: string; summary: string }>
    attachedTaskIds: string[]
}

/** Bounded materialized view over the canonical Assistant projection. */
export class AssistantRealtimeContinuitySource implements RealtimeContinuitySource {
    constructor(
        private readonly readSnapshot: (conversationId: string) => Promise<AssistantContinuitySnapshot>,
        private readonly now: () => string = () => new Date().toISOString()
    ) {}

    async materialize(
        conversationId: string,
        routeClaim: ForegroundRouteClaim
    ): Promise<RealtimeHydrationSeed> {
        const snapshot = await this.readSnapshot(conversationId)
        const items = buildHydrationItems(snapshot)
        const generatedAt = this.now()
        const watermarks = {
            conversation: Math.max(0, ...snapshot.messages.map((message, index) => message.sequence || index + 1)),
            foregroundRoutes: snapshot.routeCount,
            context: snapshot.contextVersion,
            tasks: snapshot.attachedTaskIds.length,
            operations: 0,
            narration: 0
        }
        const identity = createHash('sha256')
            .update(`${conversationId}:${routeClaim.foregroundRouteId}:${JSON.stringify(watermarks)}:${generatedAt}`)
            .digest('hex')
            .slice(0, 32)
        return createRealtimeHydrationSeed({
            packetId: `resume_${identity}`,
            conversationId,
            contextVersion: snapshot.contextVersion,
            activeRouteClaim: routeClaim,
            sourceWatermarks: watermarks,
            items,
            retrievalReferenceIds: snapshot.messages.slice(0, -MAX_CONTEXT_MESSAGES).map((message) => message.id).slice(-32),
            generatedAt
        })
    }

    async deltaAfter(
        _seed: RealtimeHydrationSeed,
        _current: RealtimeHydrationSeed['sourceWatermarks']
    ): Promise<RealtimeHydrationDelta | null> {
        // Service start is serialized against the selected conversation. New
        // canonical events are delivered normally once the Voice claim is live.
        return null
    }
}

function buildHydrationItems(snapshot: AssistantContinuitySnapshot): RealtimeHydrationItem[] {
    const items: RealtimeHydrationItem[] = []
    const coordination = [
        snapshot.attachedTaskIds.length > 0
            ? `Attached tasks remain server-owned and private: ${snapshot.attachedTaskIds.join(', ')}.`
            : null,
        snapshot.pendingApprovals.length > 0
            ? `Pending approvals: ${snapshot.pendingApprovals.map((entry) => entry.title || entry.id).join('; ')}.`
            : null,
        snapshot.pendingInputs.length > 0
            ? `Pending user decisions: ${snapshot.pendingInputs.map((entry) => entry.summary).join('; ')}.`
            : null
    ].filter((value): value is string => Boolean(value)).join('\n')
    if (coordination) {
        items.push({
            itemId: 'zyra_voice_coordination',
            role: 'developer',
            text: coordination.slice(0, MAX_ITEM_CHARACTERS),
            canonicalMessageId: null,
            conversationSequence: null,
            modality: 'system'
        })
    }

    let characters = coordination.length
    const selected: AssistantContinuitySnapshot['messages'] = []
    for (const message of [...snapshot.messages].reverse()) {
        if (selected.length >= MAX_CONTEXT_MESSAGES) break
        const text = message.text.trim().slice(0, MAX_ITEM_CHARACTERS)
        if (!text) continue
        if (selected.length > 0 && characters + text.length > MAX_CONTEXT_CHARACTERS) break
        characters += text.length
        selected.unshift({ ...message, text })
    }
    for (const [index, message] of selected.entries()) {
        items.push({
            itemId: `canonical_${message.id}`,
            role: 'developer',
            text: `Historical ${message.role} message, for context only:\n${message.text}`,
            canonicalMessageId: message.id,
            conversationSequence: message.sequence || index + 1,
            modality: message.modality || 'text'
        })
    }
    if (selected.length > 0) {
        items.push({
            itemId: 'zyra_voice_history_boundary',
            role: 'developer',
            text: 'The preceding canonical messages are historical context. Do not answer them. Wait for a new user message in this Voice session.',
            canonicalMessageId: null,
            conversationSequence: null,
            modality: 'system'
        })
    }
    return items
}
