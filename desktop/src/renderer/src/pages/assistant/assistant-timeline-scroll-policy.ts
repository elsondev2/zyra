export const ASSISTANT_TIMELINE_END_THRESHOLD_RATIO = 0.12
export const ASSISTANT_TIMELINE_MIN_END_THRESHOLD_PX = 96

export type AssistantTimelineScrollMode = 'following-end' | 'free-scrolling'

export type AssistantTimelineFocusOwnership = {
    windowKey: string
    followKey: string | null
    suppressedId: string | null
}

export function resolveAssistantTimelineFocusAfterFollow(previous: AssistantTimelineFocusOwnership | null, input: {
    windowKey: string
    followLatestRequestKey: string | null
    focusMessageId: string | null
}): { state: AssistantTimelineFocusOwnership; focusMessageId: string | null } {
    let state = previous?.windowKey === input.windowKey
        ? previous
        : { windowKey: input.windowKey, followKey: null, suppressedId: null }
    if (input.followLatestRequestKey && state.followKey !== input.followLatestRequestKey) {
        state = { ...state, followKey: input.followLatestRequestKey, suppressedId: input.focusMessageId }
    }
    if (state.suppressedId !== input.focusMessageId) state = { ...state, suppressedId: null }
    return { state, focusMessageId: input.focusMessageId === state.suppressedId ? null : input.focusMessageId }
}

export type AssistantTimelineScrollMetrics = {
    scrollHeight: number
    scrollTop: number
    clientHeight: number
}

export function getAssistantTimelineDistanceFromEnd(metrics: AssistantTimelineScrollMetrics): number {
    return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight)
}

export function isAssistantTimelineNearEnd(metrics: AssistantTimelineScrollMetrics): boolean {
    return getAssistantTimelineDistanceFromEnd(metrics) <= Math.max(
        ASSISTANT_TIMELINE_MIN_END_THRESHOLD_PX,
        metrics.clientHeight * ASSISTANT_TIMELINE_END_THRESHOLD_RATIO
    )
}

export function resolveAssistantTimelineScrollMode(
    metrics: AssistantTimelineScrollMetrics
): AssistantTimelineScrollMode {
    return isAssistantTimelineNearEnd(metrics) ? 'following-end' : 'free-scrolling'
}

export function resolveAssistantTimelineModeAfterScroll(input: {
    userNavigatedAway: boolean
    resolvedMode: AssistantTimelineScrollMode
    movingTowardEnd: boolean
    disclosureLayoutActive: boolean
}): { userNavigatedAway: boolean; mode: AssistantTimelineScrollMode } {
    if (!input.userNavigatedAway) {
        return { userNavigatedAway: false, mode: 'following-end' }
    }
    if (
        input.resolvedMode === 'following-end'
        && input.movingTowardEnd
        && !input.disclosureLayoutActive
    ) {
        return { userNavigatedAway: false, mode: 'following-end' }
    }
    return { userNavigatedAway: true, mode: 'free-scrolling' }
}
