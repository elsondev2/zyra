import type { AssistantSession, AssistantThread } from './contracts'

function hasThreadProjectLockingActivity(thread: AssistantThread): boolean {
    return (thread.messageCount || thread.messages.length) > 0
        || (thread.activityCount || thread.activities.length) > 0
        || (thread.proposedPlanCount || thread.proposedPlans.length) > 0
        || Boolean(thread.latestTurn)
        || thread.hasActivePlan
        || Boolean(thread.activePlan)
        || thread.hasPendingApprovals
        || thread.pendingApprovals.length > 0
        || thread.hasPendingUserInputs
        || thread.pendingUserInputs.length > 0
}

export function isAssistantSessionProjectLocked(
    session: Pick<AssistantSession, 'threads'> | null | undefined
): boolean {
    return Boolean(session?.threads.some(hasThreadProjectLockingActivity))
}
