export const ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT = 'assistant:timeline-disclosure-toggle'
export const DOMINANT_MESSAGE_VIEWPORT_RATIO = 0.24
export const USER_MESSAGE_VISIBLE_RATIO = 0.3

export type AssistantTimelineDisclosureAnchorMode =
    | 'preserve-user'
    | 'center-work'
    | 'preserve-message'
    | 'preserve-trigger'

export type AssistantTimelineDisclosureToggleDetail = {
    anchor: HTMLElement
    duration: number
    expanding: boolean
}

type AssistantTimelineWorkSummaryState = {
    id: string
    kind: string
    running?: boolean
    turnId?: string | null
}

export function didAssistantTimelineWorkComplete(
    previousRows: readonly AssistantTimelineWorkSummaryState[],
    nextRows: readonly AssistantTimelineWorkSummaryState[]
): boolean {
    const runningRows = previousRows.filter((row) => row.kind === 'turn-work-summary' && row.running)
    if (runningRows.length === 0) return false
    const previouslyRunningIds = new Set(runningRows.map((row) => row.id))
    const previouslyRunningTurnIds = new Set(runningRows.map((row) => row.turnId).filter(Boolean))
    return nextRows.some((row) => (
        row.kind === 'turn-work-summary'
        && row.running === false
        && (
            previouslyRunningIds.has(row.id)
            || Boolean(row.turnId && previouslyRunningTurnIds.has(row.turnId))
        )
    ))
}

export function resolveAssistantTimelineDisclosureAnchorMode(input: {
    expanding: boolean
    hasWorkRow: boolean
    userMessageVisibilityRatio: number
    dominantMessageVisibleHeight: number
    viewportHeight: number
}): AssistantTimelineDisclosureAnchorMode {
    if (input.expanding) {
        if (input.userMessageVisibilityRatio >= USER_MESSAGE_VISIBLE_RATIO) return 'preserve-user'
        if (input.hasWorkRow) return 'center-work'
    }

    if (
        input.dominantMessageVisibleHeight
        >= input.viewportHeight * DOMINANT_MESSAGE_VIEWPORT_RATIO
    ) {
        return 'preserve-message'
    }

    return 'preserve-trigger'
}

export function requestAssistantTimelineDisclosureAnchor(
    anchor: HTMLElement | null,
    duration: number,
    expanding: boolean
) {
    if (!anchor) return

    anchor.dispatchEvent(new CustomEvent<AssistantTimelineDisclosureToggleDetail>(
        ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT,
        {
            bubbles: true,
            detail: { anchor, duration, expanding }
        }
    ))
}
