import type { AssistantSnapshot, AssistantThread } from '../../shared/assistant/contracts'

export type AssistantHydratedThreadData = Pick<
    AssistantThread,
    'messages' | 'proposedPlans' | 'activities' | 'pendingApprovals' | 'pendingUserInputs' | 'activePlan'
>

function shouldKeepHydrated(thread: AssistantThread): boolean {
    return thread.state === 'starting' || thread.state === 'running' || thread.state === 'waiting'
}

export function shouldKeepHydratedThread(thread: AssistantThread): boolean {
    return shouldKeepHydrated(thread)
}

export function summarizeThread(thread: AssistantThread): AssistantThread {
    return {
        ...thread,
        activePlan: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        pendingApprovals: [],
        pendingUserInputs: []
    }
}

export function trimSnapshotToFocusedSession(snapshot: AssistantSnapshot, focusedSessionId: string | null): AssistantSnapshot {
    const next = structuredClone(snapshot)
    for (const session of next.sessions) {
        for (let index = 0; index < session.threads.length; index += 1) {
            const thread = session.threads[index]
            const shouldHydrate = (session.id === focusedSessionId && thread.id === session.activeThreadId) || shouldKeepHydrated(thread)
            if (!shouldHydrate) {
                session.threads[index] = summarizeThread(thread)
            }
        }
    }
    return next
}

export function hydrateFocusedSessionSnapshot(
    snapshot: AssistantSnapshot,
    sessionId: string,
    details: AssistantHydratedThreadData | null
): AssistantSnapshot {
    const detailsByThreadId = new Map<string, AssistantHydratedThreadData>()
    const session = snapshot.sessions.find((entry) => entry.id === sessionId)
    if (details && session?.activeThreadId) {
        detailsByThreadId.set(session.activeThreadId, details)
    }
    return hydrateSnapshotThreads(snapshot, sessionId, detailsByThreadId)
}

export function hydrateSnapshotThreads(
    snapshot: AssistantSnapshot,
    focusedSessionId: string | null,
    detailsByThreadId: Map<string, AssistantHydratedThreadData>
): AssistantSnapshot {
    const next = trimSnapshotToFocusedSession(snapshot, focusedSessionId)
    if (detailsByThreadId.size === 0) return next

    for (const session of next.sessions) {
        for (const thread of session.threads) {
            const details = detailsByThreadId.get(thread.id)
            if (!details) continue
            thread.activePlan = details.activePlan
            thread.messages = details.messages
            thread.messageCount = details.messages.length
            thread.proposedPlans = details.proposedPlans
            thread.activities = details.activities
            thread.pendingApprovals = details.pendingApprovals
            thread.pendingUserInputs = details.pendingUserInputs
        }
    }
    return next
}
