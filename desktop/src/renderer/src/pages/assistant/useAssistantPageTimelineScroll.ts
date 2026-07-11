import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
    ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT,
    resolveAssistantTimelineDisclosureAnchorMode,
    type AssistantTimelineDisclosureToggleDetail
} from './assistant-timeline-scroll-events'

const TIMELINE_HIDE_SCROLL_BUTTON_THRESHOLD_PX = 180
const INITIAL_LATEST_LOCK_MS = 1500
const DISCLOSURE_SETTLE_FRAMES = 12
const DISCLOSURE_CENTER_RESPONSE_MS = 92
const DISCLOSURE_MAX_SCROLL_PX_PER_FRAME = 42
function getVisibleHeight(elementRect: DOMRect, viewportRect: DOMRect): number {
    return Math.max(0, Math.min(elementRect.bottom, viewportRect.bottom) - Math.max(elementRect.top, viewportRect.top))
}

interface UseAssistantPageTimelineScrollArgs {
    sessionId: string | null
    threadId: string | null
    loading: boolean
    timelineMessageCount: number
    lastTimelineMessageId: string | null
    lastTimelineMessageUpdatedAt: string | null
    activityFeedCount: number
    latestTimelineActivityId: string | null
    latestTimelineActivityCreatedAt: string | null
    shouldShowWorkingIndicator: boolean
    latestTurnStartedAt: string | null
    latestTurnState: string | null
    threadState: string | null
}

export function useAssistantPageTimelineScroll(args: UseAssistantPageTimelineScrollArgs) {
    const timelineScrollRef = useRef<HTMLDivElement | null>(null)
    const timelineContentRef = useRef<HTMLDivElement | null>(null)
    const shouldAutoScrollRef = useRef(true)
    const timelineScrollRafRef = useRef<number | null>(null)
    const latestLockRafRef = useRef<number | null>(null)
    const latestLockUntilRef = useRef(0)
    const disclosureAnchorUntilRef = useRef(0)
    const disclosureAnchorRafRef = useRef<number | null>(null)
    const releaseDisclosureAnchorRef = useRef<(() => void) | null>(null)

    const isDisclosureAnchorActive = useCallback(
        () => Date.now() <= disclosureAnchorUntilRef.current,
        []
    )

    const releaseDisclosureAnchor = useCallback(() => {
        releaseDisclosureAnchorRef.current?.()
        releaseDisclosureAnchorRef.current = null
    }, [])

    const scrollTimelineToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
        const element = timelineScrollRef.current
        if (!element) return
        if (behavior === 'instant') element.scrollTop = element.scrollHeight
        else element.scrollTo({ top: element.scrollHeight, behavior })
    }, [])

    const getTimelineDistanceFromBottom = useCallback((element: HTMLDivElement) => {
        return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
    }, [])

    const isTimelineNearBottom = useCallback(
        (element: HTMLDivElement) => getTimelineDistanceFromBottom(element) <= TIMELINE_HIDE_SCROLL_BUTTON_THRESHOLD_PX,
        [getTimelineDistanceFromBottom]
    )

    const syncTimelineScrollState = useCallback((element: HTMLDivElement) => {
        if (isDisclosureAnchorActive()) return
        const nearBottom = isTimelineNearBottom(element)
        shouldAutoScrollRef.current = nearBottom
        if (!nearBottom) {
            latestLockUntilRef.current = 0
        }
    }, [isDisclosureAnchorActive, isTimelineNearBottom])

    const onScrollTimeline = useCallback((element: HTMLDivElement) => {
        if (timelineScrollRafRef.current !== null) {
            window.cancelAnimationFrame(timelineScrollRafRef.current)
        }
        timelineScrollRafRef.current = window.requestAnimationFrame(() => {
            timelineScrollRafRef.current = null
            if (isDisclosureAnchorActive()) return
            syncTimelineScrollState(element)
        })
    }, [isDisclosureAnchorActive, syncTimelineScrollState])

    const onScrollToBottom = useCallback(() => {
        shouldAutoScrollRef.current = true
        scrollTimelineToBottom('smooth')
    }, [scrollTimelineToBottom])

    const cancelLatestLockRaf = useCallback(() => {
        if (latestLockRafRef.current !== null) {
            window.cancelAnimationFrame(latestLockRafRef.current)
            latestLockRafRef.current = null
        }
    }, [])

    const stabilizeLatestPosition = useCallback((remainingFrames: number) => {
        const element = timelineScrollRef.current
        if (!element) return
        const withinLatestLock = Date.now() <= latestLockUntilRef.current
        if (!withinLatestLock && !shouldAutoScrollRef.current && !isTimelineNearBottom(element)) return

        scrollTimelineToBottom('instant')
        syncTimelineScrollState(element)

        if (remainingFrames <= 0) {
            latestLockRafRef.current = null
            return
        }

        latestLockRafRef.current = window.requestAnimationFrame(() => {
            stabilizeLatestPosition(remainingFrames - 1)
        })
    }, [isTimelineNearBottom, scrollTimelineToBottom, syncTimelineScrollState])

    useLayoutEffect(() => {
        const element = timelineScrollRef.current
        if (element) syncTimelineScrollState(element)
    }, [syncTimelineScrollState])

    useLayoutEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return
        cancelLatestLockRaf()
        shouldAutoScrollRef.current = true
        latestLockUntilRef.current = Date.now() + INITIAL_LATEST_LOCK_MS
        scrollTimelineToBottom('instant')
        syncTimelineScrollState(element)
        stabilizeLatestPosition(4)
        return () => {
            cancelLatestLockRaf()
        }
    }, [args.loading, args.sessionId, args.threadId, cancelLatestLockRaf, scrollTimelineToBottom, stabilizeLatestPosition, syncTimelineScrollState])

    useLayoutEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return
        if (!shouldAutoScrollRef.current && !isTimelineNearBottom(element)) return
        scrollTimelineToBottom('instant')
        if (timelineScrollRef.current) syncTimelineScrollState(timelineScrollRef.current)
    }, [
        args.activityFeedCount,
        args.lastTimelineMessageId,
        args.lastTimelineMessageUpdatedAt,
        args.latestTimelineActivityCreatedAt,
        args.latestTimelineActivityId,
        args.latestTurnStartedAt,
        args.latestTurnState,
        args.shouldShowWorkingIndicator,
        args.threadState,
        args.timelineMessageCount,
        isTimelineNearBottom,
        scrollTimelineToBottom,
        syncTimelineScrollState
    ])

    useEffect(() => {
        const contentElement = timelineContentRef.current
        const scrollElement = timelineScrollRef.current
        if (!contentElement || !scrollElement || typeof ResizeObserver === 'undefined') return

        const observer = new ResizeObserver(() => {
            if (isDisclosureAnchorActive()) return
            const withinLatestLock = Date.now() <= latestLockUntilRef.current
            if (!withinLatestLock && !shouldAutoScrollRef.current && !isTimelineNearBottom(scrollElement)) return
            scrollTimelineToBottom('instant')
            syncTimelineScrollState(scrollElement)
        })

        observer.observe(contentElement)
        return () => {
            observer.disconnect()
        }
    }, [args.sessionId, args.threadId, isDisclosureAnchorActive, isTimelineNearBottom, scrollTimelineToBottom, syncTimelineScrollState])

    useEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return

        const handleDisclosureToggle = (event: Event) => {
            const detail = (event as CustomEvent<AssistantTimelineDisclosureToggleDetail>).detail
            const anchor = detail?.anchor
            if (!anchor || !element.contains(anchor)) return

            releaseDisclosureAnchor()
            cancelLatestLockRaf()
            shouldAutoScrollRef.current = false
            latestLockUntilRef.current = 0

            const duration = Math.max(0, detail.duration || 0)
            const viewportRect = element.getBoundingClientRect()
            const workRow = anchor.closest<HTMLElement>('[data-assistant-timeline-row-kind="turn-work-summary"]')
            const userMessageRow = workRow?.previousElementSibling instanceof HTMLElement
                && workRow.previousElementSibling.dataset.assistantMessageRole === 'user'
                ? workRow.previousElementSibling
                : null
            const userMessageRect = userMessageRow?.getBoundingClientRect() || null
            const userMessageVisibleHeight = userMessageRect
                ? getVisibleHeight(userMessageRect, viewportRect)
                : 0
            const userMessageVisibilityRatio = userMessageRect
                ? userMessageVisibleHeight / Math.max(1, Math.min(userMessageRect.height, viewportRect.height))
                : 0
            const visibleMessageRows = Array.from(
                element.querySelectorAll<HTMLElement>('[data-assistant-timeline-row-kind="message"]')
            ).map((messageRow) => {
                const rect = messageRow.getBoundingClientRect()
                return { element: messageRow, rect, visibleHeight: getVisibleHeight(rect, viewportRect) }
            }).filter((candidate) => candidate.visibleHeight > 0)

            const dominantMessage = visibleMessageRows.sort(
                (left, right) => right.visibleHeight - left.visibleHeight
            )[0]
            const anchorMode = resolveAssistantTimelineDisclosureAnchorMode({
                expanding: detail.expanding,
                hasWorkRow: Boolean(workRow),
                userMessageVisibilityRatio,
                dominantMessageVisibleHeight: dominantMessage?.visibleHeight || 0,
                viewportHeight: viewportRect.height
            })
            const trackedElement = anchorMode === 'preserve-user'
                ? userMessageRow
                : anchorMode === 'preserve-message'
                    ? dominantMessage?.element || anchor
                    : anchor
            const trackedTop = trackedElement?.getBoundingClientRect().top ?? anchor.getBoundingClientRect().top
            const centerExpandedWork = anchorMode === 'center-work'
            const previousOverflowAnchor = element.style.overflowAnchor
            const settleUntil = performance.now() + duration
            let settleFramesRemaining = DISCLOSURE_SETTLE_FRAMES
            let previousFrameTime = performance.now()
            let released = false

            element.style.overflowAnchor = 'none'
            disclosureAnchorUntilRef.current = Date.now() + duration + 100

            const release = (preserveCooldown = false) => {
                if (released) return
                released = true
                if (!preserveCooldown) disclosureAnchorUntilRef.current = 0
                if (disclosureAnchorRafRef.current !== null) {
                    window.cancelAnimationFrame(disclosureAnchorRafRef.current)
                    disclosureAnchorRafRef.current = null
                }
                element.style.overflowAnchor = previousOverflowAnchor
                element.removeEventListener('wheel', cancelForUser)
                element.removeEventListener('touchmove', cancelForUser)
                window.removeEventListener('keydown', handleScrollKey)
            }

            const cancelForUser = () => release(false)

            const handleScrollKey = (keyboardEvent: KeyboardEvent) => {
                if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(keyboardEvent.key)) return
                release(false)
            }

            const stabilizeAnchor = (frameTime: number) => {
                if (released || !anchor.isConnected) {
                    release(false)
                    return
                }

                if (centerExpandedWork && workRow) {
                    const frameDuration = Math.min(34, Math.max(1, frameTime - previousFrameTime))
                    previousFrameTime = frameTime
                    const workRect = workRow.getBoundingClientRect()
                    const centerDelta = (
                        workRect.top + workRect.height / 2
                    ) - (
                        viewportRect.top + viewportRect.height / 2
                    )
                    if (Math.abs(centerDelta) > 0.5) {
                        const response = 1 - Math.exp(-frameDuration / DISCLOSURE_CENTER_RESPONSE_MS)
                        const maxFrameStep = DISCLOSURE_MAX_SCROLL_PX_PER_FRAME * (frameDuration / 16.67)
                        const easedStep = Math.sign(centerDelta) * Math.min(
                            Math.abs(centerDelta) * response,
                            maxFrameStep
                        )
                        element.scrollTop += easedStep
                    }
                } else if (trackedElement) {
                    const topDelta = trackedElement.getBoundingClientRect().top - trackedTop
                    if (Math.abs(topDelta) > 0.1) {
                        element.scrollTop += topDelta
                    }
                }

                if (performance.now() >= settleUntil) {
                    settleFramesRemaining -= 1
                    if (settleFramesRemaining < 0) {
                        release(true)
                        return
                    }
                }

                disclosureAnchorRafRef.current = window.requestAnimationFrame(stabilizeAnchor)
            }

            releaseDisclosureAnchorRef.current = cancelForUser
            element.addEventListener('wheel', cancelForUser, { passive: true })
            element.addEventListener('touchmove', cancelForUser, { passive: true })
            window.addEventListener('keydown', handleScrollKey)
            disclosureAnchorRafRef.current = window.requestAnimationFrame(stabilizeAnchor)
        }

        element.addEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
        return () => {
            element.removeEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
            releaseDisclosureAnchor()
        }
    }, [args.sessionId, args.threadId, cancelLatestLockRaf, releaseDisclosureAnchor])

    useEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return

        const handleUserJump = () => {
            shouldAutoScrollRef.current = false
            latestLockUntilRef.current = 0
            cancelLatestLockRaf()
        }

        element.addEventListener('assistant:timeline-user-jump', handleUserJump)
        return () => element.removeEventListener('assistant:timeline-user-jump', handleUserJump)
    }, [cancelLatestLockRaf])

    useEffect(() => {
        return () => {
            releaseDisclosureAnchor()
            cancelLatestLockRaf()
            if (timelineScrollRafRef.current !== null) {
                window.cancelAnimationFrame(timelineScrollRafRef.current)
            }
        }
    }, [cancelLatestLockRaf, releaseDisclosureAnchor])

    return {
        timelineContentRef,
        timelineScrollRef,
        onScrollTimeline,
        onScrollToBottom
    }
}
