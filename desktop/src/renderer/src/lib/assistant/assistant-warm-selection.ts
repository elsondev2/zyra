import type { AssistantSnapshot } from '@shared/assistant/contracts'
import { encodeAssistantHistoryCursor } from '@shared/assistant/history-cursor'
import {
    compareAssistantTimelineOrderKeys,
    getAssistantTimelineOrderKey,
    type AssistantTimelineOrderKey
} from '@shared/assistant/timeline-order'
import {
    hasRenderableAssistantRetainedHistory,
    isAssistantRetainedHistoryFresh,
    replaceAssistantVisibleHistory,
    type AssistantRetainedHistory
} from './assistant-history-state'
import type { AssistantStoreState } from './assistant-store-runtime'
import {
    applyCachedSessionSelection,
    boundCachedHydratedThreadState,
    type CachedHydratedThreadState
} from './session-hydration-cache'

type AssistantWarmSelectionInput = {
    snapshot: AssistantSnapshot
    sessionId: string
    threadId: string | null
    hydratedThreadCache: Map<string, CachedHydratedThreadState>
    historyByThreadId: AssistantStoreState['historyByThreadId']
}

type TimelineRange = {
    oldest: AssistantTimelineOrderKey | null
    newest: AssistantTimelineOrderKey | null
}

function getTimelineRange(history: Pick<AssistantRetainedHistory, 'messages' | 'activities' | 'proposedPlans'>): TimelineRange {
    let oldest: AssistantTimelineOrderKey | null = null
    let newest: AssistantTimelineOrderKey | null = null

    const include = (key: AssistantTimelineOrderKey) => {
        if (!oldest || compareAssistantTimelineOrderKeys(key, oldest) < 0) oldest = key
        if (!newest || compareAssistantTimelineOrderKeys(key, newest) > 0) newest = key
    }
    for (const record of history.messages) include(getAssistantTimelineOrderKey('message', record))
    for (const record of history.activities) include(getAssistantTimelineOrderKey('activity', record))
    for (const record of history.proposedPlans) include(getAssistantTimelineOrderKey('plan', record))
    return { oldest, newest }
}

function getWarmHistoryWindow(
    history: AssistantRetainedHistory,
    thread: AssistantSnapshot['sessions'][number]['threads'][number],
    sessionId: string
): AssistantRetainedHistory {
    const visibleSource = thread.messages.length || thread.activities.length || thread.proposedPlans.length
        ? thread
        : history
    const bounded = boundCachedHydratedThreadState({
        sessionId,
        threadId: thread.id,
        revision: history.shellRevision,
        activePlan: thread.activePlan,
        messages: visibleSource.messages,
        activities: visibleSource.activities,
        proposedPlans: visibleSource.proposedPlans,
        pendingApprovals: thread.pendingApprovals,
        pendingUserInputs: thread.pendingUserInputs
    })
    const sourceRange = getTimelineRange(history)
    const visibleRange = getTimelineRange(bounded)
    const retainedOlder = Boolean(
        sourceRange.oldest
        && visibleRange.oldest
        && compareAssistantTimelineOrderKeys(sourceRange.oldest, visibleRange.oldest) < 0
    )
    const retainedNewer = Boolean(
        sourceRange.newest
        && visibleRange.newest
        && compareAssistantTimelineOrderKeys(sourceRange.newest, visibleRange.newest) > 0
    )
    const hasOlder = history.pageInfo.hasOlder || retainedOlder
    const hasNewer = history.pageInfo.hasNewer || retainedNewer
    const rowsUnchanged = bounded.messages === history.messages
        && bounded.activities === history.activities
        && bounded.proposedPlans === history.proposedPlans
    if (rowsUnchanged && !retainedOlder && !retainedNewer) return history

    return {
        ...history,
        messages: bounded.messages,
        activities: bounded.activities,
        proposedPlans: bounded.proposedPlans,
        pageInfo: {
            ...history.pageInfo,
            oldestCursor: retainedOlder && visibleRange.oldest
                ? encodeAssistantHistoryCursor(thread.id, visibleRange.oldest)
                : history.pageInfo.oldestCursor,
            newestCursor: retainedNewer && visibleRange.newest
                ? encodeAssistantHistoryCursor(thread.id, visibleRange.newest)
                : history.pageInfo.newestCursor,
            hasOlder,
            hasNewer,
            turnCount: bounded.messages.filter((message) => message.role === 'user').length
        },
        fullyLoaded: !hasOlder && !hasNewer,
        lastUsedAt: Date.now()
    }
}

export function prepareAssistantWarmSelection(input: AssistantWarmSelectionInput): {
    snapshot: AssistantSnapshot
    historyByThreadId: AssistantStoreState['historyByThreadId']
} {
    let snapshot = applyCachedSessionSelection(
        input.snapshot,
        input.sessionId,
        input.threadId,
        input.hydratedThreadCache
    )
    const session = snapshot.sessions.find((entry) => entry.id === input.sessionId) || null
    const threadId = input.threadId || session?.activeThreadId || null
    const thread = threadId
        ? session?.threads.find((entry) => entry.id === threadId) || null
        : null
    const retainedHistory = threadId ? input.historyByThreadId[threadId] : undefined
    if (
        !threadId
        || !isAssistantRetainedHistoryFresh(retainedHistory, thread)
        || !hasRenderableAssistantRetainedHistory(retainedHistory)
    ) return { snapshot, historyByThreadId: input.historyByThreadId }

    const warmHistory = getWarmHistoryWindow(retainedHistory!, thread!, input.sessionId)
    snapshot = replaceAssistantVisibleHistory(snapshot, threadId, warmHistory)
    return {
        snapshot,
        historyByThreadId: warmHistory === retainedHistory
            ? input.historyByThreadId
            : { ...input.historyByThreadId, [threadId]: warmHistory }
    }
}

export function applyAssistantWarmSelection(input: AssistantWarmSelectionInput): AssistantSnapshot {
    return prepareAssistantWarmSelection(input).snapshot
}
