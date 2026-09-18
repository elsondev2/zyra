import type { AssistantService } from './assistant/service'
import { normalizeFileChangePayload } from '../shared/assistant/contracts/file-change'

type ReviewService = Pick<AssistantService, 'getSnapshot' | 'getReviewIndex' | 'getTurnDetail' | 'getSessionTurnUsage'>

/** Reuse Desktop's persisted turn ledger; a phone never supplies a local thread ID. */
export class MobileReviewAccess {
    private metadataCache = new Map<string, { version: string; index: any; weight: number; failedAt?: number }>()
    private metadataQueue = new Map<string, { threadId: string; version: string }>()
    private metadataActive = new Map<string, string>()
    private metadataRunning = false
    constructor(private readonly service: () => ReviewService) {}

    private async thread(canonicalChatId: string) {
        const service = this.service()
        const snapshot = await service.getSnapshot()
        const thread = snapshot.sessions.flatMap(session => session.threads)
            .find(thread => thread.providerThreadId === canonicalChatId)
        if (!thread) throw new Error('This chat has not synchronized with Desktop yet. Refresh and try again.')
        return { service, thread }
    }

    async index(canonicalChatId: string) {
        const { service, thread } = await this.thread(canonicalChatId)
        return (await service.getReviewIndex(thread.id)).index
    }

    async details(canonicalChatId: string) {
        const { service, thread } = await this.thread(canonicalChatId)
        const snapshot = await service.getSnapshot()
        const session = snapshot.sessions.find(session => session.threads.some(candidate => candidate.id === thread.id))
        if (!session) throw new Error('Refresh this chat before viewing its usage.')
        const { usage } = await service.getSessionTurnUsage({ sessionId: session.id })
        return { model: thread.model, turns: usage.turns.filter(turn => turn.threadId === thread.id),
            totals: usage.totals?.threadId === thread.id ? usage.totals : null, fetchedAt: usage.fetchedAt }
    }

    async metadata(ids: string[]) {
        const snapshot = await this.service().getSnapshot()
        const threads = new Map(snapshot.sessions.flatMap(session => session.threads).map(thread => [thread.providerThreadId, thread]))
        const output = ids.slice(0, 60).map(canonicalChatId => {
            const thread = threads.get(canonicalChatId)
            if (!thread) return { canonicalChatId, hasWork: null, index: null, pending: false }
            const version = `${thread.updatedAt}:${thread.canonicalHistoryModifiedAt}:${thread.canonicalHistoryEntryCount}`
            const cached = this.metadataCache.get(canonicalChatId)
            if ((cached?.version !== version || (cached.failedAt && Date.now() - cached.failedAt > 30000)) && this.metadataActive.get(canonicalChatId) !== version && this.metadataQueue.size < 60) this.metadataQueue.set(canonicalChatId, { threadId: thread.id, version })
            return { canonicalChatId, hasWork: typeof thread.activityCount === 'number' ? thread.activityCount > 0 || thread.proposedPlanCount > 0 : null,
                index: cached?.version === version ? cached.index : null, pending: this.metadataQueue.has(canonicalChatId) || this.metadataActive.has(canonicalChatId) }
        })
        // Summary disk reads never delay opening a catalog page; one bounded worker fills the next refresh.
        if (!this.metadataRunning) void this.fillMetadata().catch(() => undefined)
        return output
    }

    private async fillMetadata() {
        this.metadataRunning = true
        try {
            while (this.metadataQueue.size) {
                const [id, request] = this.metadataQueue.entries().next().value!
                this.metadataQueue.delete(id)
                this.metadataActive.set(id, request.version)
                try {
                    const { index } = await this.service().getReviewIndex(request.threadId)
                    let weight = 0, truncated = false
                    const turns = index.turns.flatMap(turn => { const changes = turn.changes.filter(() => { if (++weight > 2048) { truncated = true; return false }; return true }); return changes.length ? [{ changes }] : [] })
                    this.metadataCache.delete(id)
                    this.metadataCache.set(id, { version: request.version, index: { turns, truncated }, weight: Math.min(weight, 2048) })
                    while (this.metadataCache.size > 128 || [...this.metadataCache.values()].reduce((sum, item) => sum + item.weight, 0) > 10000) this.metadataCache.delete(this.metadataCache.keys().next().value!)
                } catch { this.metadataCache.set(id, { version: request.version, index: null, weight: 0, failedAt: Date.now() }) }
                finally {
                    this.metadataActive.delete(id)
                    while (this.metadataCache.size > 128) this.metadataCache.delete(this.metadataCache.keys().next().value!)
                }
            }
        } finally { this.metadataRunning = false }
    }

    async turn(canonicalChatId: string, turnId: string) {
        const { service, thread } = await this.thread(canonicalChatId)
        const index = (await service.getReviewIndex(thread.id)).index
        if (!index.turns.some(turn => turn.id === turnId)) throw new Error('This turn is no longer available in this chat.')
        const { detail } = await service.getTurnDetail(thread.id, turnId)
        return {
            messages: detail.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({
                id: message.id, role: message.role, text: message.text, createdAt: message.createdAt
            })),
            activities: detail.activities.flatMap(activity => {
                const payload = activity.payload || {}
                if (activity.kind !== 'file-change' && payload.category !== 'file-change') return []
                const change = normalizeFileChangePayload(payload, {
                    provider: payload.provider === 'pi' ? 'pi' : 'codex', startedAt: activity.createdAt, status: 'completed'
                })
                if (change.status === 'failed') return []
                return [{ id: activity.id, changes: change.changes, paths: change.paths,
                    patch: change.patch || change.displayDiff || change.previewPatch || '',
                    truncated: change.truncated === true, unavailableReason: change.diffUnavailableReason }]
            })
        }
    }
}
