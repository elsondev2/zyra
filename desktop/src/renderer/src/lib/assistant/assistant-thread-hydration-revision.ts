import type { AssistantThread } from '@shared/assistant/contracts'

export function getAssistantThreadHydrationRevision(thread: AssistantThread): string {
    // Hydrated rows are content cache entries. Runtime presence, model settings,
    // turn usage, and completion timestamps can change after the final history
    // row is persisted; including them here needlessly discarded a warm chat and
    // forced a visible detail reload on the next selection.
    //
    // Canonical chats expose an explicit history revision. Older/local records
    // may not, so retain updatedAt as the conservative fallback for those only.
    const historyModifiedAt = thread.canonicalHistoryModifiedAt || thread.updatedAt
    return [
        thread.id,
        historyModifiedAt,
        thread.messageCount || 0,
        thread.activityCount || 0,
        thread.proposedPlanCount || 0,
        thread.canonicalHistoryEntryCount ?? '',
        thread.hasActivePlan ? 1 : 0,
        thread.hasPendingApprovals ? 1 : 0,
        thread.hasPendingUserInputs ? 1 : 0
    ].join('|')
}
