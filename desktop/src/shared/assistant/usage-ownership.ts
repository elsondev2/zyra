import type { AssistantSessionTurnUsageEntry } from './contracts'
import type { UsageEntry } from './usage-summary'
export function assignUsageOwnership(records: UsageEntry[], ownedSessionIds: readonly string[]) {
    const owned = new Set(ownedSessionIds), covered = new Set<string>()
    const entries = records.map(row => {
        if (!row.sessionId || !owned.has(row.sessionId)) return row
        covered.add(row.sessionId)
        return {...row,harness:'zyra' as const}
    })
    return {entries,coveredSessionIds:[...covered]}
}
export function usageProjectionFallback(turns: AssistantSessionTurnUsageEntry[], coveredSessionIds: readonly string[]) {
    const covered = new Set(coveredSessionIds)
    return turns.filter(turn => ![turn.canonicalThreadId,turn.threadId,turn.sessionId].some(id => id && covered.has(id)))
}
