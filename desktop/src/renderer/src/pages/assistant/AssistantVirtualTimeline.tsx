import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { LegendList, type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react'
import { ChevronUp, LoaderCircle } from 'lucide-react'
import type { TimelineDisplayRow } from './assistant-timeline-helpers'
import {
    ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT,
    didAssistantTimelineWorkComplete,
    type AssistantTimelineDisclosureToggleDetail
} from './assistant-timeline-scroll-events'

const keyExtractor = (row: TimelineDisplayRow) => row.id
const getItemType = (row: TimelineDisplayRow) => row.kind
const DEFAULT_DISCLOSURE_SETTLE_MS = 420
const DISCLOSURE_SETTLE_PADDING_MS = 80
const COMPLETION_END_FOLLOW_DELAYS_MS = [32, 96, 180, 320, 480, 640] as const

function isNearTimelineEnd(element: HTMLElement): boolean {
    const distanceFromEnd = Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
    return distanceFromEnd <= Math.max(96, element.clientHeight * 0.12)
}

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
    const renderRowRef = useRef(props.renderRow)
    const disclosureTimerRef = useRef(0)
    const bootstrapRevisionRef = useRef(0)
    const activeWindowKeyRef = useRef(props.windowKey)
    const previousContentInsetEndRef = useRef(props.contentInsetEndAdjustment)
    const touchStartYRef = useRef<number | null>(null)
    const previousRowsRef = useRef(props.rows)
    const previousCompletionWindowKeyRef = useRef(props.windowKey)
    const followingEndRef = useRef(true)
    const completionFollowActiveRef = useRef(false)
    const completionFollowTimersRef = useRef<number[]>([])
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
    const [disclosureLayoutActive, setDisclosureLayoutActive] = useState(false)
    const [settledWindowKey, setSettledWindowKey] = useState<string | null>(null)
    const [olderLoadIntentWindowKey, setOlderLoadIntentWindowKey] = useState<string | null>(null)
    activeWindowKeyRef.current = props.windowKey
    const startupSettled = settledWindowKey === props.windowKey
    const olderLoadIntent = olderLoadIntentWindowKey === props.windowKey
    renderRowRef.current = props.renderRow

    const beginDisclosureLayout = useCallback((duration = DEFAULT_DISCLOSURE_SETTLE_MS) => {
        window.clearTimeout(disclosureTimerRef.current)
        setDisclosureLayoutActive(true)
        disclosureTimerRef.current = window.setTimeout(() => {
            setDisclosureLayoutActive(false)
        }, Math.max(0, duration) + DISCLOSURE_SETTLE_PADDING_MS)
    }, [])

    const clearCompletionEndFollow = useCallback(() => {
        completionFollowActiveRef.current = false
        for (const timerId of completionFollowTimersRef.current) window.clearTimeout(timerId)
        completionFollowTimersRef.current = []
    }, [])

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
        const targetWindowKey = props.windowKey
        const revision = bootstrapRevisionRef.current + 1
        bootstrapRevisionRef.current = revision
        const settleAtEnd = async () => {
            await props.listRef.current?.scrollToEnd({ animated: false })
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
            if (bootstrapRevisionRef.current !== revision || activeWindowKeyRef.current !== targetWindowKey) return
            await props.listRef.current?.scrollToEnd({ animated: false })
            if (bootstrapRevisionRef.current !== revision || activeWindowKeyRef.current !== targetWindowKey) return
            followingEndRef.current = true
            setSettledWindowKey(targetWindowKey)
        }
        void settleAtEnd()
    }, [props.listRef, props.windowKey])

    useEffect(() => {
        if (!scrollElement) return
        const handleDisclosureToggle = (event: Event) => {
            const detail = (event as CustomEvent<AssistantTimelineDisclosureToggleDetail>).detail
            beginDisclosureLayout(detail?.duration)
        }
        const handleTimelinePointerDown = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Element)) return
            if (target === scrollElement) {
                clearCompletionEndFollow()
                followingEndRef.current = isNearTimelineEnd(scrollElement)
            }
            const button = target.closest('button')
            if (!button || !scrollElement.contains(button) || !button.closest('[data-assistant-timeline-row-id]')) return
            beginDisclosureLayout()
        }
        const handleKeyboardClick = (event: MouseEvent) => {
            if (event.detail !== 0) return
            handleTimelinePointerDown(event as unknown as PointerEvent)
        }
        const armOlderLoading = () => {
            if (settledWindowKey !== props.windowKey) return
            setOlderLoadIntentWindowKey(props.windowKey)
        }
        const handleWheel = (event: WheelEvent) => {
            if (event.deltaY < 0) {
                clearCompletionEndFollow()
                followingEndRef.current = false
                armOlderLoading()
            }
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
                clearCompletionEndFollow()
                followingEndRef.current = false
                armOlderLoading()
            }
        }
        const handleTouchStart = (event: TouchEvent) => {
            touchStartYRef.current = event.touches[0]?.clientY ?? null
        }
        const handleTouchMove = (event: TouchEvent) => {
            const nextY = event.touches[0]?.clientY ?? null
            const previousY = touchStartYRef.current
            if (nextY !== null && previousY !== null && nextY > previousY + 4) {
                clearCompletionEndFollow()
                followingEndRef.current = false
                armOlderLoading()
            }
            touchStartYRef.current = nextY
        }
        scrollElement.addEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
        scrollElement.addEventListener('pointerdown', handleTimelinePointerDown, { passive: true })
        scrollElement.addEventListener('click', handleKeyboardClick)
        scrollElement.addEventListener('wheel', handleWheel, { passive: true })
        scrollElement.addEventListener('keydown', handleKeyDown)
        scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true })
        scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true })
        return () => {
            scrollElement.removeEventListener(ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT, handleDisclosureToggle)
            scrollElement.removeEventListener('pointerdown', handleTimelinePointerDown)
            scrollElement.removeEventListener('click', handleKeyboardClick)
            scrollElement.removeEventListener('wheel', handleWheel)
            scrollElement.removeEventListener('keydown', handleKeyDown)
            scrollElement.removeEventListener('touchstart', handleTouchStart)
            scrollElement.removeEventListener('touchmove', handleTouchMove)
        }
    }, [beginDisclosureLayout, clearCompletionEndFollow, props.windowKey, scrollElement, settledWindowKey])

    useLayoutEffect(() => {
        const previousInset = previousContentInsetEndRef.current
        const nextInset = props.contentInsetEndAdjustment
        previousContentInsetEndRef.current = nextInset
        if (previousInset === nextInset || !scrollElement) return

        const distanceFromEnd = Math.max(
            0,
            scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight
        )
        const endAnchorThreshold = Math.max(96, Math.abs(nextInset - previousInset) + 32)
        if (distanceFromEnd > endAnchorThreshold) return

        const frameId = window.requestAnimationFrame(() => {
            scrollElement.scrollTop = scrollElement.scrollHeight
            void props.listRef.current?.scrollToEnd({ animated: false })
        })
        return () => window.cancelAnimationFrame(frameId)
    }, [props.contentInsetEndAdjustment, props.listRef, scrollElement])

    useLayoutEffect(() => {
        if (previousCompletionWindowKeyRef.current !== props.windowKey) {
            previousCompletionWindowKeyRef.current = props.windowKey
            previousRowsRef.current = props.rows
            clearCompletionEndFollow()
            followingEndRef.current = true
            return
        }

        const previousRows = previousRowsRef.current
        previousRowsRef.current = props.rows
        if (!scrollElement || !followingEndRef.current || !didAssistantTimelineWorkComplete(previousRows, props.rows)) return

        clearCompletionEndFollow()
        completionFollowActiveRef.current = true
        beginDisclosureLayout(COMPLETION_END_FOLLOW_DELAYS_MS[COMPLETION_END_FOLLOW_DELAYS_MS.length - 1])
        const settleAtEnd = () => {
            if (!completionFollowActiveRef.current) return
            scrollElement.scrollTop = scrollElement.scrollHeight
            void props.listRef.current?.scrollToEnd({ animated: false })
        }
        settleAtEnd()
        completionFollowTimersRef.current = COMPLETION_END_FOLLOW_DELAYS_MS.map((delay, index) => window.setTimeout(() => {
            settleAtEnd()
            if (index === COMPLETION_END_FOLLOW_DELAYS_MS.length - 1) {
                completionFollowActiveRef.current = false
                completionFollowTimersRef.current = []
                followingEndRef.current = isNearTimelineEnd(scrollElement)
            }
        }, delay))
    }, [beginDisclosureLayout, clearCompletionEndFollow, props.listRef, props.rows, props.windowKey, scrollElement])

    useEffect(() => () => {
        window.clearTimeout(disclosureTimerRef.current)
        clearCompletionEndFollow()
    }, [clearCompletionEndFollow])
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

    const header = props.hasOlder || props.loadingOlder || props.loadOlderError ? (
        <div className="flex justify-center pb-4 pt-2">
            <button
                type="button"
                onClick={requestOlderPage}
                disabled={props.loadingOlder}
                className="assistant-older-messages-loader inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-sparkle-card/95 px-2.5 py-1 text-[10px] font-medium text-sparkle-text-muted shadow-lg shadow-black/20 backdrop-blur-md hover:text-sparkle-text-secondary disabled:pointer-events-none"
            >
                {props.loadingOlder
                    ? <LoaderCircle size={11} className="animate-spin" aria-hidden="true" />
                    : <ChevronUp size={11} aria-hidden="true" />}
                {props.loadOlderError ? 'Retry earlier messages' : props.loadingOlder ? 'Loading earlier messages' : 'Earlier messages'}
            </button>
            {props.loadOlderError ? <span className="sr-only">{props.loadOlderError}</span> : null}
        </div>
    ) : <div className="h-2" />

    return (
        <>
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
            maintainVisibleContentPosition={{ data: true }}
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
            onStartReachedThreshold={0.2}
            onScroll={() => {
                const element = props.scrollContainerRef?.current || scrollElement
                if (!element) return
                if (!completionFollowActiveRef.current) followingEndRef.current = isNearTimelineEnd(element)
                props.onScrollContainer?.(element)
            }}
            className="custom-scrollbar h-full w-full overflow-x-hidden [overflow-anchor:none] [scrollbar-gutter:stable]"
            contentContainerClassName="mx-auto w-full max-w-3xl px-4 pt-0 md:translate-x-[2px]"
        />
        </>
    )
})
