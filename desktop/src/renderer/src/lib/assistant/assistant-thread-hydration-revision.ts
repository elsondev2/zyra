import type { AssistantThread } from '@shared/assistant/contracts'

export function getAssistantThreadHydrationRevision(thread: AssistantThread): string {
    return [
        thread.id,
        thread.updatedAt,
        thread.messageCount || 0,
        thread.activityCount || 0,
        thread.proposedPlanCount || 0,
        thread.canonicalHistoryModifiedAt || '',
        thread.canonicalHistoryEntryCount ?? '',
        thread.hasActivePlan ? 1 : 0,
        thread.hasPendingApprovals ? 1 : 0,
        thread.hasPendingUserInputs ? 1 : 0,
        thread.latestTurn?.id || '',
        thread.latestTurn?.state || '',
        thread.latestTurn?.completedAt || ''
    ].join('|')
}
