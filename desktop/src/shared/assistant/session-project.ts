import type { AssistantSession, AssistantThread } from './contracts'

/**
 * A fresh thread can be in `starting` while Desktop prepares its canonical
 * connection before the first prompt. That connection is disposable and must
 * not turn project selection into active chat work.
 */
export function isAssistantThreadProjectWarmupOnly(
    thread: Pick<
        AssistantThread,
        | 'state'
        | 'messageCount'
        | 'latestTurn'
        | 'hasActivePlan'
        | 'activePlan'
        | 'hasPendingApprovals'
        | 'pendingApprovals'
        | 'hasPendingUserInputs'
        | 'pendingUserInputs'
    >
): boolean {
    return thread.state === 'starting'
        && (thread.messageCount || 0) === 0
        && !thread.latestTurn
        && !thread.hasActivePlan
        && !thread.activePlan
        && !thread.hasPendingApprovals
        && !thread.pendingApprovals.some((entry) => entry.status === 'pending')
        && !thread.hasPendingUserInputs
        && !thread.pendingUserInputs.some((entry) => entry.status === 'pending')
}

/**
 * Project assignment remains mutable after history exists. It is paused only
 * while a thread has active/pending work that still belongs to the current cwd.
 */
export function isAssistantSessionProjectLocked(
    session: Pick<AssistantSession, 'threads'> | null | undefined
): boolean {
    return Boolean(session?.threads.some((thread) =>
        (thread.state === 'starting' && !isAssistantThreadProjectWarmupOnly(thread))
        || ['running', 'waiting'].includes(thread.state)
        || thread.latestTurn?.state === 'running'
        || thread.hasPendingApprovals
        || thread.pendingApprovals.some((entry) => entry.status === 'pending')
        || thread.hasPendingUserInputs
        || thread.pendingUserInputs.some((entry) => entry.status === 'pending')
    ))
}
