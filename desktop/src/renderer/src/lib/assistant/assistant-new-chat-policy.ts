import type { AssistantSession, AssistantThread } from '@shared/assistant/contracts'

export function isUnstartedAssistantThread(thread: AssistantThread | null | undefined): boolean {
    if (!thread) return false
    const userVisibleMessages = (thread.messages || []).filter((message) => message.role !== 'system')
    return userVisibleMessages.length === 0
        && !thread.latestTurn
        && !thread.activePlan
        && (thread.messageCount || 0) === 0
        && thread.proposedPlans.length === 0
        && thread.pendingApprovals.length === 0
        && thread.pendingUserInputs.length === 0
}

export function isPristineAssistantThread(thread: AssistantThread | null | undefined): boolean {
    return isUnstartedAssistantThread(thread)
        && !thread?.providerThreadId
        && (thread?.activityCount || 0) === 0
        && (thread?.activities.length || 0) === 0
        && !thread?.lastError
        && thread?.state === 'idle'
}

export function isPristineAssistantSession(session: AssistantSession | null | undefined): boolean {
    if (!session || session.archived || session.pendingLabRequest || session.threads.length === 0) return false
    return session.threads.every(isPristineAssistantThread)
}

export function shouldEagerlyConnectAssistantThread(thread: AssistantThread | null | undefined): boolean {
    return Boolean(thread && !isUnstartedAssistantThread(thread))
}
