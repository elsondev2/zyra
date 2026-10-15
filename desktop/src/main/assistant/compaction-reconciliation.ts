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
    const exact = hasSequence ? activities.find(activity => isCompaction(activity) && (
        activity.payload?.sourceSequence === sequence || activity.payload?.startedSequence === sequence
    )) : null
    if (exact) return exact
    if (payload.status !== 'completed') return null
    const key = resultKey(payload)
    if (!key) return null
    return activities.find(activity => isCompaction(activity) && (
        activity.payload?.status === 'completed' || (activity.payload?.canonicalEntry as Payload | undefined)?.type === 'compaction'
    ) && (!hasSequence || typeof activity.payload?.sourceSequence !== 'number')
        && resultKey(activity.payload) === key) || null
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
