import type {
    CanonicalMessageCommitReceipt,
    ForegroundRouteClaim
} from '../../../shared/assistant/contracts'
import type { ConversationGateway } from '../foreground/conversation-gateway'

export type CanonicalTypedVoiceResponseInput = {
    adapterSessionId: string
    conversationId: string
    routeClaim: ForegroundRouteClaim
    messageId: string
    providerItemId: string
    text: string
    completedAt: string
}

export class CanonicalTypedVoiceResponseCommitter {
    private readonly closingAdapterSessionIds = new Set<string>()
    private readonly pendingByAdapterSessionId = new Map<string, Set<Promise<CanonicalMessageCommitReceipt>>>()
    private disposed = false

    constructor(private readonly gateway: ConversationGateway) {}

    activate(adapterSessionId: string): void {
        if (this.disposed) throw new Error('Canonical typed Voice committer is disposed.')
        this.closingAdapterSessionIds.delete(adapterSessionId)
    }

    isAccepting(adapterSessionId: string): boolean {
        return !this.disposed && !this.closingAdapterSessionIds.has(adapterSessionId)
    }

    async commit(input: CanonicalTypedVoiceResponseInput): Promise<CanonicalMessageCommitReceipt | null> {
        if (!this.isAccepting(input.adapterSessionId)) return null

        const commit = this.gateway.commitMessage({
            conversationId: input.conversationId,
            messageId: input.messageId,
            role: 'assistant',
            producer: 'realtime_foreground',
            modality: 'voice',
            text: input.text,
            attachmentIds: [],
            routeClaim: input.routeClaim,
            providerItemId: input.providerItemId,
            providerCompletedAt: input.completedAt,
            idempotencyKey: `voice-typed-response:${input.conversationId}:${input.routeClaim.foregroundRouteId}:${input.providerItemId}`
        })
        const pending = this.pendingByAdapterSessionId.get(input.adapterSessionId) || new Set()
        pending.add(commit)
        this.pendingByAdapterSessionId.set(input.adapterSessionId, pending)
        try {
            return await commit
        } finally {
            pending.delete(commit)
            if (pending.size === 0) this.pendingByAdapterSessionId.delete(input.adapterSessionId)
        }
    }

    async beginStop(adapterSessionId: string): Promise<void> {
        this.closingAdapterSessionIds.add(adapterSessionId)
        const pending = [...(this.pendingByAdapterSessionId.get(adapterSessionId) || [])]
        await Promise.allSettled(pending)
    }

    async dispose(): Promise<void> {
        this.disposed = true
        for (const adapterSessionId of this.pendingByAdapterSessionId.keys()) {
            this.closingAdapterSessionIds.add(adapterSessionId)
        }
        const pending = [...this.pendingByAdapterSessionId.values()].flatMap((entries) => [...entries])
        await Promise.allSettled(pending)
        this.closingAdapterSessionIds.clear()
        this.pendingByAdapterSessionId.clear()
    }
}
