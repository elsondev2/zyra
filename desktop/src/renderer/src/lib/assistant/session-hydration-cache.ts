import type { AssistantSnapshot, AssistantThread } from '@shared/assistant/contracts'

export type CachedHydratedThreadState = Pick<
    AssistantThread,
    'activePlan' | 'messages' | 'proposedPlans' | 'activities' | 'pendingApprovals' | 'pendingUserInputs'
> & {
    sessionId: string
    threadId: string
}

function hasHydratedThreadState(thread: AssistantThread): boolean {
    return Boolean(thread.activePlan)
        || thread.messages.length > 0
        || thread.proposedPlans.length > 0
        || thread.activities.length > 0
        || thread.pendingApprovals.length > 0
        || thread.pendingUserInputs.length > 0
}

function areCachedThreadStatesReferentiallyEqual(
    left: CachedHydratedThreadState | undefined,
    right: CachedHydratedThreadState
): boolean {
    return left?.sessionId === right.sessionId
        && left?.threadId === right.threadId
        && left.activePlan === right.activePlan
        && left.messages === right.messages
        && left.proposedPlans === right.proposedPlans
        && left.activities === right.activities
        && left.pendingApprovals === right.pendingApprovals
        && left.pendingUserInputs === right.pendingUserInputs
}

export function cacheHydratedThreads(
    cache: Map<string, CachedHydratedThreadState>,
    snapshot: AssistantSnapshot
): void {
    const presentThreadIds = new Set<string>()

    for (const session of snapshot.sessions) {
        for (const thread of session.threads) {
            presentThreadIds.add(thread.id)
            if (!hasHydratedThreadState(thread)) {
                const cached = cache.get(thread.id)
                if (cached?.sessionId && cached.sessionId !== session.id) {
                    cache.delete(thread.id)
                } else if ((thread.messageCount || 0) === 0 && !thread.latestTurn) {
                    cache.delete(thread.id)
                }
                continue
            }

            const nextCachedState: CachedHydratedThreadState = {
                sessionId: session.id,
                threadId: thread.id,
                activePlan: thread.activePlan,
                messages: thread.messages,
                proposedPlans: thread.proposedPlans,
                activities: thread.activities,
                pendingApprovals: thread.pendingApprovals,
                pendingUserInputs: thread.pendingUserInputs
            }

            const previousCachedState = cache.get(thread.id)
            if (areCachedThreadStatesReferentiallyEqual(previousCachedState, nextCachedState)) continue

            cache.set(thread.id, nextCachedState)
        }
    }

    for (const threadId of [...cache.keys()]) {
        if (!presentThreadIds.has(threadId)) {
            cache.delete(threadId)
        }
    }
}

export function applyCachedSessionSelection(
    snapshot: AssistantSnapshot,
    sessionId: string,
    threadId: string | null,
    cache: Map<string, CachedHydratedThreadState>
): AssistantSnapshot {
    const session = snapshot.sessions.find((entry) => entry.id === sessionId) || null
    const targetThreadId = threadId || session?.activeThreadId || null
    const cached = targetThreadId ? cache.get(targetThreadId) : null
    const nextSessions = snapshot.sessions.map((session) => {
        if (session.id !== sessionId) return session
        if (!cached || cached.sessionId !== sessionId || session.activeThreadId !== cached.threadId) {
            if (!targetThreadId || session.activeThreadId === targetThreadId) return session
            return {
                ...session,
                activeThreadId: targetThreadId
            }
        }

        let threadChanged = false
        const nextThreads = session.threads.map((thread) => {
            if (thread.id !== cached.threadId) return thread
            if (
                thread.activePlan === cached.activePlan
                && thread.messages === cached.messages
                && thread.proposedPlans === cached.proposedPlans
                && thread.activities === cached.activities
                && thread.pendingApprovals === cached.pendingApprovals
                && thread.pendingUserInputs === cached.pendingUserInputs
            ) {
                return thread
            }

            threadChanged = true
            return {
                ...thread,
                activePlan: cached.activePlan,
                messages: cached.messages,
                proposedPlans: cached.proposedPlans,
                activities: cached.activities,
                pendingApprovals: cached.pendingApprovals,
                pendingUserInputs: cached.pendingUserInputs
            }
        })

        if (!threadChanged && session.activeThreadId === targetThreadId) return session
        return {
            ...session,
            activeThreadId: targetThreadId,
            threads: nextThreads
        }
    })

    if (snapshot.selectedSessionId === sessionId && nextSessions === snapshot.sessions) {
        return snapshot
    }

    return {
        ...snapshot,
        selectedSessionId: sessionId,
        sessions: nextSessions
    }
}

export function hasCachedSessionSelection(
    snapshot: AssistantSnapshot,
    sessionId: string,
    threadId: string | null,
    cache: Map<string, CachedHydratedThreadState>
): boolean {
    const session = snapshot.sessions.find((entry) => entry.id === sessionId)
    const targetThreadId = threadId || session?.activeThreadId || null
    if (!session || !targetThreadId || !session.threads.some((thread) => thread.id === targetThreadId)) {
        return false
    }

    const cached = cache.get(targetThreadId)
    return Boolean(cached && cached.sessionId === sessionId && cached.threadId === targetThreadId)
}
