import type {
    AssistantActivity,
    AssistantHistoryPage,
    AssistantPendingApproval,
    AssistantPendingUserInput,
    AssistantProposedPlan,
    AssistantShellSnapshot,
    AssistantSnapshot,
    AssistantThread,
    AssistantThreadDetail,
    AssistantThreadHistoryState
} from '@shared/assistant/contracts'
import { compareAssistantTimelineOrderKeys, getAssistantTimelineOrderKey, type AssistantTimelineRecordKind } from '@shared/assistant/timeline-order'

const DETAIL_IDLE_TTL_MS = 5 * 60_000
const DETAIL_CACHE_LIMIT = 20

export type AssistantRetainedHistory = AssistantThreadHistoryState & { lastUsedAt: number }
export type AssistantHistoryByThreadId = Record<string, AssistantRetainedHistory>

export function isAssistantRetainedHistoryFresh(history: AssistantRetainedHistory | undefined, now = Date.now()): boolean {
    return Boolean(history && now - history.lastUsedAt <= DETAIL_IDLE_TTL_MS)
}

export function hasRenderableAssistantRetainedHistory(history: AssistantRetainedHistory | undefined): boolean {
    return Boolean(history && (
        history.messages.length
        || history.activities.length
        || history.proposedPlans.length
    ))
}

export function hasAssistantPersistedThreadContent(thread: AssistantThread | null | undefined): boolean {
    if (!thread) return false
    return (thread.messageCount || 0) > 0
        || (thread.activityCount || 0) > 0
        || (thread.proposedPlanCount || 0) > 0
        || thread.hasActivePlan
        || thread.hasPendingApprovals
        || thread.hasPendingUserInputs
}

export function formatAssistantHistoryLoadError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || 'Failed to load earlier messages.')
    if (/aborted\(oom\)|out of memory/i.test(message)) {
        return 'Earlier messages exceeded the active history reader memory limit. Restart Zyra to load the bounded reader, then retry.'
    }
    return message
}

export function shouldShowAssistantThreadHistoryLoader(input: {
    selectionHydrating: boolean
    snapshotLoading: boolean
    historyLoaded: boolean
    historyLoadFailed: boolean
    hasPersistedContent: boolean
}): boolean {
    if (input.selectionHydrating) return true
    return !input.snapshotLoading
        && !input.historyLoaded
        && !input.historyLoadFailed
        && input.hasPersistedContent
}

export function materializeAssistantShellSnapshot(snapshot: AssistantShellSnapshot): AssistantSnapshot {
    return {
        ...snapshot,
        sessions: snapshot.sessions.map((session) => ({
            ...session,
            threads: session.threads.map((thread): AssistantThread => ({
                ...thread,
                activePlan: null,
                messages: [],
                proposedPlans: [],
                activities: [],
                pendingApprovals: [],
                pendingUserInputs: []
            }))
        }))
    }
}

function mergeById<T extends { id: string }>(
    kind: AssistantTimelineRecordKind,
    existing: T[],
    incoming: T[]
): T[] {
    const byId = new Map(incoming.map((entry) => [entry.id, entry]))
    for (const entry of existing) byId.set(entry.id, entry)
    return [...byId.values()].sort((left, right) => compareAssistantTimelineOrderKeys(
        getAssistantTimelineOrderKey(kind, left as never),
        getAssistantTimelineOrderKey(kind, right as never)
    ))
}

function mergePending<T extends AssistantPendingApproval | AssistantPendingUserInput>(existing: T[], incoming: T[]): T[] {
    const byId = new Map(incoming.map((entry) => [entry.id, entry]))
    for (const entry of existing) byId.set(entry.id, entry)
    return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function patchThread(snapshot: AssistantSnapshot, threadId: string, patch: (thread: AssistantThread) => AssistantThread): AssistantSnapshot {
    let changed = false
    const sessions = snapshot.sessions.map((session) => {
        const threadIndex = session.threads.findIndex((thread) => thread.id === threadId)
        if (threadIndex < 0) return session
        const threads = [...session.threads]
        threads[threadIndex] = patch(threads[threadIndex]!)
        changed = true
        return { ...session, threads }
    })
    return changed ? { ...snapshot, sessions } : snapshot
}

export function applyAssistantThreadDetail(
    snapshot: AssistantSnapshot,
    detail: AssistantThreadDetail
): { snapshot: AssistantSnapshot; history: AssistantRetainedHistory } {
    const now = Date.now()
    let mergedHistory: AssistantRetainedHistory = { ...detail.history, lastUsedAt: now }
    const nextSnapshot = patchThread(snapshot, detail.threadId, (thread) => {
        const messages = mergeById('message', thread.messages, detail.history.messages)
        const activities = mergeById('activity', thread.activities, detail.history.activities)
        const proposedPlans = mergeById('plan', thread.proposedPlans, detail.history.proposedPlans)
        mergedHistory = { ...detail.history, messages, activities, proposedPlans, lastUsedAt: now }
        return {
            ...thread,
            activePlan: detail.activePlan,
            hasActivePlan: Boolean(detail.activePlan),
            messages,
            activities,
            proposedPlans,
            pendingApprovals: mergePending(thread.pendingApprovals, detail.pendingApprovals),
            pendingUserInputs: mergePending(thread.pendingUserInputs, detail.pendingUserInputs),
            hasPendingApprovals: detail.pendingApprovals.some((entry) => entry.status === 'pending'),
            hasPendingUserInputs: detail.pendingUserInputs.some((entry) => entry.status === 'pending')
        }
    })
    return { snapshot: nextSnapshot, history: mergedHistory }
}

export function applyAssistantRetainedHistory(
    snapshot: AssistantSnapshot,
    threadId: string,
    history: AssistantRetainedHistory
): AssistantSnapshot {
    return patchThread(snapshot, threadId, (thread) => ({
        ...thread,
        messages: mergeById('message', thread.messages, history.messages),
        activities: mergeById('activity', thread.activities, history.activities),
        proposedPlans: mergeById('plan', thread.proposedPlans, history.proposedPlans)
    }))
}

export function applyAssistantHistoryPage(
    snapshot: AssistantSnapshot,
    current: AssistantRetainedHistory,
    page: AssistantHistoryPage
): { snapshot: AssistantSnapshot; history: AssistantRetainedHistory } {
    let history = current
    const nextSnapshot = patchThread(snapshot, page.threadId, (thread) => {
        const messages = mergeById('message', thread.messages, page.messages)
        const activities = mergeById('activity', thread.activities, page.activities)
        const proposedPlans = mergeById('plan', thread.proposedPlans, page.proposedPlans)
        history = {
            ...current,
            messages,
            activities,
            proposedPlans,
            pageInfo: page.pageInfo,
            loadingOlder: false,
            loadOlderError: null,
            fullyLoaded: !page.pageInfo.hasOlder,
            lastUsedAt: Date.now()
        }
        return { ...thread, messages, activities, proposedPlans }
    })
    return { snapshot: nextSnapshot, history }
}

export function pruneAssistantHistoryCache(
    histories: AssistantHistoryByThreadId,
    protectedThreadIds: ReadonlySet<string>,
    now = Date.now()
): AssistantHistoryByThreadId {
    const entries = Object.entries(histories)
        .filter(([threadId, history]) => protectedThreadIds.has(threadId) || now - history.lastUsedAt <= DETAIL_IDLE_TTL_MS)
        .sort((left, right) => right[1].lastUsedAt - left[1].lastUsedAt)
    const retained = entries.filter(([threadId], index) => protectedThreadIds.has(threadId) || index < DETAIL_CACHE_LIMIT)
    return Object.fromEntries(retained)
}
