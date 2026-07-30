import type { AssistantSession } from './contracts'

/**
 * Project assignment remains mutable after history exists. It is paused only
 * while a thread has active/pending work that still belongs to the current cwd.
 */
export function isAssistantSessionProjectLocked(
    session: Pick<AssistantSession, 'threads'> | null | undefined
): boolean {
    return Boolean(session?.threads.some((thread) =>
        ['starting', 'running', 'waiting'].includes(thread.state)
        || thread.latestTurn?.state === 'running'
        || thread.hasPendingApprovals
        || thread.pendingApprovals.some((entry) => entry.status === 'pending')
        || thread.hasPendingUserInputs
        || thread.pendingUserInputs.some((entry) => entry.status === 'pending')
    ))
}
