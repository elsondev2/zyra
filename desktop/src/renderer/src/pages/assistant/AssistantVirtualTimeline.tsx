import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { LegendList, type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react'
import { ChevronUp } from 'lucide-react'
import {
    rendererVisibility,
    shouldSnapRendererPresentation,
    useRendererVisibilitySnapshot
} from '@/lib/renderer-visibility'
import type { TimelineDisplayRow } from './assistant-timeline-helpers'
import {
    ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT,
    didAssistantTimelineWorkComplete,
    type AssistantTimelineDisclosureToggleDetail
} from './assistant-timeline-scroll-events'
import {
    resolveAssistantTimelineScrollMode,
    shouldArmAssistantOlderHistoryLoad,
    type AssistantTimelineScrollMode
} from './assistant-timeline-scroll-policy'

const keyExtractor = (row: TimelineDisplayRow) => row.id
const getItemType = (row: TimelineDisplayRow) => row.kind
const DEFAULT_DISCLOSURE_SETTLE_MS = 420
const DISCLOSURE_SETTLE_PADDING_MS = 80
const COMPLETION_LAYOUT_SETTLE_MS = 720
const ASSISTANT_TIMELINE_USER_JUMP_EVENT = 'assistant:timeline-user-jump'

type LegendScrollViewHandle = {
    getScrollableNode?: () => HTMLElement | null
}

function resolveScrollElement(value: unknown): HTMLDivElement | null {
    if (value instanceof HTMLDivElement) return value
    if (!value || typeof value !== 'object') return null
    const node = (value as LegendScrollViewHandle).getScrollableNode?.()
    return node instanceof HTMLDivElement ? node : null
}

export const AssistantVirtualTimeline = memo(function AssistantVirtualTimeline(props: {
    rows: TimelineDisplayRow[]
    windowKey: string
    listRef: RefObject<LegendListRef | null>
    scrollContainerRef?: RefObject<HTMLDivElement | null>
    contentInsetEndAdjustment: number
    hasOlder: boolean
    loadingOlder: boolean
    loadOlderError: string | null
    onLoadOlder?: () => void
    onScrollContainer?: (element: HTMLDivElement) => void
    renderRow: (row: TimelineDisplayRow) => ReactNode
}) {
    const visibilitySnapshot = useRendererVisibilitySnapshot()
    const renderRowRef = useRef(props.renderRow)
    const disclosureTimerRef = useRef(0)
    const completionFollowTimerRef = useRef(0)
    const endAlignmentFrameRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const previousRowsRef = useRef(props.rows)
    const previousCompletionWindowKeyRef = useRef(props.windowKey)
    const scrollModeRef = useRef<AssistantTimelineScrollMode>('following-end')
    const completionFollowActiveRef = useRef(false)
    const handledResumeRevisionRef = useRef(visibilitySnapshot.resumeRevision)
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
    const [disclosureLayoutActive, setDisclosureLayoutActive] = useState(false)
    const [settledWindowKey, setSettledWindowKey] = useState<string | null>(null)
    const [olderLoadIntentWindowKey, setOlderLoadIntentWindowKey] = useState<string | null>(null)
    const startupSettled = settledWindowKey === props.windowKey
    const olderLoadIntent = olderLoadIntentWindowKey === props.windowKey
    renderRowRef.current = props.renderRow

    const cancelEndAlignment = useCallback(() => {
        if (endAlignmentFrameRef.current === null) return
        window.cancelAnimationFrame(endAlignmentFrameRef.current)
        endAlignmentFrameRef.current = null
    }, [])

    const requestEndAlignment = useCallback(() => {
        if (endAlignmentFrameRef.current !== null) return
        endAlignmentFrameRef.current = window.requestAnimationFrame(() => {
            endAlignmentFrameRef.current = null
            if (scrollModeRef.current !== 'following-end') return
            void props.listRef.current?.scrollToEnd({ animated: false })
        })
    }, [props.listRef])

    const beginDisclosureLayout = useCallback((duration = DEFAULT_DISCLOSURE_SETTLE_MS) => {
        window.clearTimeout(disclosureTimerRef.current)
        setDisclosureLayoutActive(true)
        disclosureTimerRef.current = window.setTimeout(() => {
            disclosureTimerRef.current = 0
            setDisclosureLayoutActive(false)
        }, Math.max(0, duration) + DISCLOSURE_SETTLE_PADDING_MS)
    }, [])

    const clearCompletionEndFollow = useCallback(() => {
        completionFollowActiveRef.current = false
        window.clearTimeout(completionFollowTimerRef.current)
        completionFollowTimerRef.current = 0
    }, [])

    const stopFollowingForUserNavigation = useCallback(() => {
        clearCompletionEndFollow()
        cancelEndAlignment()
        scrollModeRef.current = 'free-scrolling'
    }, [cancelEndAlignment, clearCompletionEndFollow])

    useLayoutEffect(() => {
        const shouldSnap = shouldSnapRendererPresentation(
            visibilitySnapshot,
            handledResumeRevisionRef.current
        )
        handledResumeRevisionRef.current = visibilitySnapshot.resumeRevision
        if (!shouldSnap) return

        const shouldFollowEnd = completionFollowActiveRef.current
            || scrollModeRef.current === 'following-end'
        clearCompletionEndFollow()
        cancelEndAlignment()
        window.clearTimeout(disclosureTimerRef.current)
        disclosureTimerRef.current = 0
        setDisclosureLayoutActive(false)

        if (!shouldFollowEnd) return
        scrollModeRef.current = 'following-end'
        void props.listRef.current?.scrollToEnd({ animated: false })
    }, [
        cancelEndAlignment,
        clearCompletionEndFollow,
        props.listRef,
        visibilitySnapshot.resumeRevision,
        visibilitySnapshot.visible
    ])

    const assignScrollViewRef = useCallback((value: unknown) => {
        const element = resolveScrollElement(value)
        if (props.scrollContainerRef) props.scrollContainerRef.current = element
        setScrollElement((current) => current === element ? current : element)
    }, [props.scrollContainerRef])

    const requestOlderPage = useCallback(() => {
        setOlderLoadIntentWindowKey(null)
        props.onLoadOlder?.()
    }, [props.onLoadOlder])

    const handleInitialLoad = useCallback(() => {
        scrollModeRef.current = 'following-end'
        setOlderLoadIntentWindowKey(null)
        setSettledWindowKey(props.windowKey)
    }, [props.windowKey])

    useEffect(() => {
        if (!scrollElement) return
        const handleDisclosureToggle = (event: Event) => {
            const detail = (event as CustomEvent<AssistantTimelineDisclosureToggleDetail>).detail
            beginDisclosureLayout(detail?.duration)
        }
        const handleTimelinePointerDown = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Element)) return
            stopFollowingForUserNavigation()
            const button = target.closest('button')
            if (!button || !scrollElement.contains(button) || !button.closest('[data-assistant-timeline-row-id]')) return
            beginDisclosureLayout()
        }
        const handleKeyboardClick = (event: MouseEvent) => {
            if (event.detail !== 0) return
            handleTimelinePointerDown(event as unknown as PointerEvent)
        }
        const armOlderLoading = (upwardIntent: boolean) => {
            if (!shouldArmAssistantOlderHistoryLoad({ startupSettled, upwardIntent })) return
            setOlderLoadIntentWindowKey(props.windowKey)
        }
        const handleWheel = (event: WheelEvent) => {
            stopFollowingForUserNavigation()
            armOlderLoading(event.deltaY < 0)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            const upwardIntent = ['ArrowUp', 'PageUp', 'Home'].includes(event.key)
            if (!upwardIntent) return
            stopFollowingForUserNavigation()
            armOlderLoading(true)
        }
        const handleTouchStart = (event: TouchEvent) => {
            touchStartYRef.current = event.touches[0]?.clientY ?? null
        }
        const handleTouchMove = (event: TouchEvent) => {
            const nextY = event.touches[0]?.clientY ?? null
            const previousY = touchStartYRef.current
            if (nextY !== null && previousY !== null && Math.abs(nextY - previousY) > 4) {
                stopFollowingForUserNavigation()
                armOlderLoading(nextY > previousY)
            }
            touchStartYRef.current = nextY
        }
        const handleUserJump = () => stopFollowingForUserNavigation()
        scrollElement.addEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
        scrollElement.addEventListener(ASSISTANT_TIMELINE_USER_JUMP_EVENT, handleUserJump)
        scrollElement.addEventListener('pointerdown', handleTimelinePointerDown, { passive: true })
        scrollElement.addEventListener('click', handleKeyboardClick)
        scrollElement.addEventListener('wheel', handleWheel, { passive: true })
        scrollElement.addEventListener('keydown', handleKeyDown)
        scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true })
        scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true })
        return () => {
            scrollElement.removeEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
            scrollElement.removeEventListener(ASSISTANT_TIMELINE_USER_JUMP_EVENT, handleUserJump)
            scrollElement.removeEventListener('pointerdown', handleTimelinePointerDown)
            scrollElement.removeEventListener('click', handleKeyboardClick)
            scrollElement.removeEventListener('wheel', handleWheel)
            scrollElement.removeEventListener('keydown', handleKeyDown)
            scrollElement.removeEventListener('touchstart', handleTouchStart)
            scrollElement.removeEventListener('touchmove', handleTouchMove)
        }
    }, [beginDisclosureLayout, props.windowKey, scrollElement, startupSettled, stopFollowingForUserNavigation])

    useLayoutEffect(() => {
        if (previousCompletionWindowKeyRef.current !== props.windowKey) {
            previousCompletionWindowKeyRef.current = props.windowKey
            previousRowsRef.current = props.rows
            clearCompletionEndFollow()
            cancelEndAlignment()
            scrollModeRef.current = 'following-end'
            return
        }

        const previousRows = previousRowsRef.current
        previousRowsRef.current = props.rows
        if (
            !scrollElement
            || scrollModeRef.current !== 'following-end'
            || !didAssistantTimelineWorkComplete(previousRows, props.rows)
        ) return

        clearCompletionEndFollow()
        const visibility = rendererVisibility.getSnapshot()
        if (shouldSnapRendererPresentation(visibility, visibility.resumeRevision)) {
            void props.listRef.current?.scrollToEnd({ animated: false })
            return
        }

        completionFollowActiveRef.current = true
        beginDisclosureLayout(COMPLETION_LAYOUT_SETTLE_MS - DISCLOSURE_SETTLE_PADDING_MS)
        completionFollowTimerRef.current = window.setTimeout(() => {
            completionFollowTimerRef.current = 0
            completionFollowActiveRef.current = false
            requestEndAlignment()
        }, COMPLETION_LAYOUT_SETTLE_MS)
    }, [
        beginDisclosureLayout,
        cancelEndAlignment,
        clearCompletionEndFollow,
        props.listRef,
        props.rows,
        props.windowKey,
        requestEndAlignment,
        scrollElement
    ])

    useEffect(() => () => {
        window.clearTimeout(disclosureTimerRef.current)
        clearCompletionEndFollow()
        cancelEndAlignment()
    }, [cancelEndAlignment, clearCompletionEndFollow])

    const renderItem = useCallback(({ item }: LegendListRenderItemProps<TimelineDisplayRow>) => (
        <div
            id={item.kind === 'message' ? `assistant-message-${encodeURIComponent(item.message.id)}` : undefined}
            className="pb-4"
            data-assistant-timeline-row-id={item.id}
            data-assistant-timeline-row-kind={item.kind}
            data-assistant-message-role={item.kind === 'message' ? item.message.role : undefined}
        >
            {renderRowRef.current(item)}
        </div>
    ), [])

    const header = (
        <div className="flex min-h-11 justify-center pt-2">
            {props.loadOlderError ? (
                <>
                    <button
                        type="button"
                        onClick={requestOlderPage}
                        className="assistant-older-messages-loader inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-sparkle-card/95 px-2.5 py-1 text-[10px] font-medium text-sparkle-text-muted shadow-lg shadow-black/20 backdrop-blur-md hover:text-sparkle-text-secondary"
                    >
                        <ChevronUp size={11} aria-hidden="true" />
                        Retry earlier messages
                    </button>
                    <span className="sr-only">{props.loadOlderError}</span>
                </>
            ) : props.loadingOlder ? (
                <span className="sr-only" role="status">Loading earlier messages</span>
            ) : null}
        </div>
    )

    return (
        <LegendList
            key={props.windowKey}
            ref={props.listRef}
            refScrollView={assignScrollViewRef}
            data={props.rows}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            renderItem={renderItem}
            estimatedItemSize={90}
            initialScrollAtEnd
            onLoad={handleInitialLoad}
            maintainVisibleContentPosition={{ data: true, size: false }}
            maintainScrollAtEnd={{
                animated: false,
                on: {
                    dataChange: true,
                    itemLayout: !disclosureLayoutActive,
                    layout: !disclosureLayoutActive
                }
            }}
            maintainScrollAtEndThreshold={0.12}
            contentInsetEndAdjustment={props.contentInsetEndAdjustment}
            ListHeaderComponent={header}
            estimatedHeaderSize={44}
            onStartReached={startupSettled && olderLoadIntent && props.hasOlder && !props.loadingOlder && !props.loadOlderError ? requestOlderPage : undefined}
            onStartReachedThreshold={1.25}
            onScroll={() => {
                const element = props.scrollContainerRef?.current || scrollElement
                if (!element) return
                if (!completionFollowActiveRef.current) {
                    scrollModeRef.current = resolveAssistantTimelineScrollMode(element)
                }
                props.onScrollContainer?.(element)
            }}
            className="assistant-chat-scrollbar h-full w-full overflow-x-hidden [overflow-anchor:none] [scrollbar-gutter:stable]"
            contentContainerClassName="mx-auto w-full max-w-3xl px-4 pt-0 md:translate-x-[2px]"
        />
    )
})
