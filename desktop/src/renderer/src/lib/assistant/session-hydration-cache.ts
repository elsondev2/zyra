import type { AssistantSnapshot, AssistantThread } from '@shared/assistant/contracts'
import { getAssistantThreadHydrationRevision } from './assistant-thread-hydration-revision'

const HYDRATED_THREAD_CACHE_LIMIT = 12

export type CachedHydratedThreadState = Pick<
    AssistantThread,
    'activePlan' | 'messages' | 'proposedPlans' | 'activities' | 'pendingApprovals' | 'pendingUserInputs'
> & {
    sessionId: string
    threadId: string
    revision: string
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
        && left.revision === right.revision
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
                if (
                    cached
                    && (
                        cached.sessionId !== session.id
                        || cached.revision !== getAssistantThreadHydrationRevision(thread)
                    )
                ) {
                    cache.delete(thread.id)
                } else if ((thread.messageCount || 0) === 0 && !thread.latestTurn) {
                    cache.delete(thread.id)
                }
                continue
            }

            const nextCachedState: CachedHydratedThreadState = {
                sessionId: session.id,
                threadId: thread.id,
                revision: getAssistantThreadHydrationRevision(thread),
                activePlan: thread.activePlan,
                messages: thread.messages,
                proposedPlans: thread.proposedPlans,
                activities: thread.activities,
                pendingApprovals: thread.pendingApprovals,
                pendingUserInputs: thread.pendingUserInputs
            }

            const previousCachedState = cache.get(thread.id)
            if (areCachedThreadStatesReferentiallyEqual(previousCachedState, nextCachedState)) continue

            cache.delete(thread.id)
            cache.set(thread.id, nextCachedState)
        }
    }

    for (const threadId of [...cache.keys()]) {
        if (!presentThreadIds.has(threadId)) cache.delete(threadId)
    }

    const protectedThreadIds = new Set(snapshot.sessions.flatMap((session) => session.threads
        .filter((thread) => (
            (session.id === snapshot.selectedSessionId && thread.id === session.activeThreadId)
            || ['starting', 'running', 'waiting', 'background'].includes(thread.state)
            || thread.hasActivePlan
            || thread.hasPendingApprovals
            || thread.hasPendingUserInputs
            || thread.pendingApprovals.length > 0
            || thread.pendingUserInputs.length > 0
        ))
        .map((thread) => thread.id)))
    for (const threadId of [...cache.keys()]) {
        if (cache.size <= HYDRATED_THREAD_CACHE_LIMIT) break
        if (!protectedThreadIds.has(threadId)) cache.delete(threadId)
    }
}

export function applyCachedSessionSelection(
    snapshot: AssistantSnapshot,
    sessionId: string,
    threadId: string | null,
    cache: Map<string, CachedHydratedThreadState>
): AssistantSnapshot {
    const sessionIndex = snapshot.sessions.findIndex((entry) => entry.id === sessionId)
    const session = sessionIndex >= 0 ? snapshot.sessions[sessionIndex] : null
    const targetThreadId = threadId || session?.activeThreadId || null
    const targetThread = targetThreadId ? session?.threads.find((thread) => thread.id === targetThreadId) || null : null
    const candidate = targetThreadId ? cache.get(targetThreadId) : null
    const cached = candidate
        && targetThread
        && candidate.sessionId === sessionId
        && candidate.revision === getAssistantThreadHydrationRevision(targetThread)
        ? candidate
        : null
    if (targetThreadId && candidate && !cached) cache.delete(targetThreadId)
    if (targetThreadId && cached) {
        cache.delete(targetThreadId)
        cache.set(targetThreadId, cached)
    }
    let nextSession = session

    if (session && targetThreadId && session.activeThreadId !== targetThreadId) {
        nextSession = { ...session, activeThreadId: targetThreadId }
    }

    if (nextSession && cached && cached.sessionId === sessionId && targetThreadId === cached.threadId) {
        const threadIndex = nextSession.threads.findIndex((thread) => thread.id === cached.threadId)
        const thread = threadIndex >= 0 ? nextSession.threads[threadIndex] : null
        if (thread && (
            thread.activePlan !== cached.activePlan
            || thread.messages !== cached.messages
            || thread.proposedPlans !== cached.proposedPlans
            || thread.activities !== cached.activities
            || thread.pendingApprovals !== cached.pendingApprovals
            || thread.pendingUserInputs !== cached.pendingUserInputs
        )) {
            const threads = nextSession.threads.slice()
            threads[threadIndex] = {
                ...thread,
                activePlan: cached.activePlan,
                messages: cached.messages,
                proposedPlans: cached.proposedPlans,
                activities: cached.activities,
                pendingApprovals: cached.pendingApprovals,
                pendingUserInputs: cached.pendingUserInputs
            }
            nextSession = { ...nextSession, threads }
        }
    }

    const sessionChanged = Boolean(session && nextSession && nextSession !== session)
    if (snapshot.selectedSessionId === sessionId && !sessionChanged) return snapshot
    if (!sessionChanged) return { ...snapshot, selectedSessionId: sessionId }

    const sessions = snapshot.sessions.slice()
    sessions[sessionIndex] = nextSession!
    return {
        ...snapshot,
        selectedSessionId: sessionId,
        sessions
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

    const thread = session.threads.find((entry) => entry.id === targetThreadId) || null
    const cached = cache.get(targetThreadId)
    return Boolean(
        thread
        && cached
        && cached.sessionId === sessionId
        && cached.threadId === targetThreadId
        && cached.revision === getAssistantThreadHydrationRevision(thread)
    )
}
