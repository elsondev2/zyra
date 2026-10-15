import type { AssistantActivity } from '../../shared/assistant/contracts'

type Payload = Record<string, unknown>
function isCompaction(activity: AssistantActivity): boolean {
    return activity.kind === 'context.compaction' || activity.kind === 'context-compaction'
        || activity.payload?.category === 'context-compaction'
}
function resultKey(payload: Payload | null | undefined): string | null {
    const canonical = payload?.canonicalEntry as Payload | undefined
    const result = canonical?.type === 'compaction' ? canonical : payload
    const kept = result?.firstKeptEntryId
    const tokens = result?.tokensBefore
    return typeof kept === 'string' && kept && typeof tokens === 'number' && Number.isFinite(tokens)
        ? JSON.stringify([kept, tokens]) : null
}

/** Only replay may match a settled lifecycle. Identical live results can be
 * independent operations and must keep their own rows. */
export function findReplayedCompaction(activities: AssistantActivity[], payload: Payload): AssistantActivity | null {
    if (payload.replay !== true) return null
    const sequence = payload.sourceSequence
    const hasSequence = typeof sequence === 'number' && Number.isFinite(sequence)
    const sequences = [sequence, payload.startedSequence].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const matches = activities.filter(activity => isCompaction(activity) && sequences.some(value =>
        activity.payload?.sourceSequence === value || activity.payload?.startedSequence === value))
    const settled = matches.find(activity => activity.payload?.status !== 'running')
    if (settled) return settled
    if (payload.status === 'completed') {
        const key = resultKey(payload)
        const canonical = key && activities.find(activity => isCompaction(activity)
            && (activity.payload?.canonicalEntry as Payload | undefined)?.type === 'compaction'
            && (!hasSequence || typeof activity.payload?.sourceSequence !== 'number') && resultKey(activity.payload) === key)
        if (canonical) return canonical
    }
    if (matches[0]) return matches[0]
    if (payload.status !== 'completed') return null
    const key = resultKey(payload)
    if (!key) return null
    return activities.find(activity => isCompaction(activity) && activity.payload?.status === 'completed'
        && (!hasSequence || typeof activity.payload?.sourceSequence !== 'number') && resultKey(activity.payload) === key) || null
}

/** Canonical entries are durable, distinct operations. Drop their live/replay
 * projections, never canonical entries or failed/cancelled attempts. */
export function findSupersededRuntimeCompactionIds(existing: AssistantActivity[], canonical: AssistantActivity[]): string[] {
    const keys = new Set(canonical.filter(activity => isCompaction(activity)
        && (activity.payload?.canonicalEntry as Payload | undefined)?.type === 'compaction').map(activity => resultKey(activity.payload)).filter(Boolean))
    return existing.filter(activity => activity.kind === 'context.compaction'
        && activity.payload?.status === 'completed'
        && !activity.payload?.canonicalEntry
        && keys.has(resultKey(activity.payload))).map(activity => activity.id)
}

/** Reconcile one operation only. A stale start from another operation is history,
 * not a candidate for the next start/end, even when it is still marked running. */
export function reconcileRuntimeCompaction(activities: AssistantActivity[], payload: Payload, activityId?: string): { target: AssistantActivity | null; duplicateIds: string[] } {
    const sequences = [payload.sourceSequence, payload.startedSequence].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const matching = activities.filter(activity => isCompaction(activity) && (
        activity.id === activityId || sequences.some(value => activity.payload?.sourceSequence === value || activity.payload?.startedSequence === value)
    ))
    const target = findReplayedCompaction(activities, payload) || matching.find(activity => activity.payload?.status !== 'running') || matching[0] || null
    return { target, duplicateIds: matching.filter(activity => activity.id !== target?.id && !activity.payload?.canonicalEntry).map(activity => activity.id) }
}

export function findInactiveRuntimeCompactions(activities: AssistantActivity[], active: Array<{ sequence?: number; occurredAt?: string }>): AssistantActivity[] {
    return activities.filter(activity => isCompaction(activity) && activity.payload?.status === 'running'
        && !activity.payload?.canonicalEntry && !active.some(entry =>
            (entry.sequence != null && (activity.payload?.sourceSequence === entry.sequence || activity.payload?.startedSequence === entry.sequence))
            || (entry.occurredAt && entry.occurredAt === (activity.payload?.startedAt || activity.createdAt))))
}
