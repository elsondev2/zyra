import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { AssistantActivity, AssistantMessage, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import {
    formatWorkingTimer,
    getActivityTitle,
    parseUserMessageAttachments,
    type TimelineRenderRow
} from './assistant-timeline-helpers'
import { stripProposedPlanBlocks } from './assistant-proposed-plan'

type TimelineCheckpoint = {
    id: string
    rowId: string
    title: string
    detail: string | null
    meta: string | null
    turnId: string | null
    markerTop: number
    scrollTop: number
    running: boolean
}

type RailGeometry = {
    left: number
    top: number
    height: number
    railHeight: number
}

const TIMELINE_MINIMAP_ITEM_SPACING = 8
const TIMELINE_MINIMAP_MIN_ITEMS = 2
const TIMELINE_MINIMAP_MAX_VERTICAL_CHROME = 288
const TIMELINE_MINIMAP_PANE_INSET = 8
export const TIMELINE_MINIMAP_MAX_MARKERS = 28
const TIMELINE_MINIMAP_WHEEL_STEP_PX = 28

export function resolveTimelineMinimapWindow(
    itemCount: number,
    centerIndex: number,
    maxItems = TIMELINE_MINIMAP_MAX_MARKERS
): { startIndex: number; endIndex: number; hiddenBefore: number; hiddenAfter: number } {
    const safeItemCount = Math.max(0, itemCount)
    const safeMaxItems = Math.max(1, maxItems)
    if (safeItemCount <= safeMaxItems) {
        return { startIndex: 0, endIndex: safeItemCount, hiddenBefore: 0, hiddenAfter: 0 }
    }

    const safeCenterIndex = Math.max(0, Math.min(safeItemCount - 1, centerIndex))
    const maxStartIndex = safeItemCount - safeMaxItems
    const startIndex = Math.max(0, Math.min(maxStartIndex, safeCenterIndex - Math.floor(safeMaxItems / 2)))
    const endIndex = startIndex + safeMaxItems
    return {
        startIndex,
        endIndex,
        hiddenBefore: startIndex,
        hiddenAfter: safeItemCount - endIndex
    }
}

export function resolveTimelineMinimapHeight(itemCount: number, viewportHeight: number): number {
    const naturalHeight = Math.max(1, (itemCount - 1) * TIMELINE_MINIMAP_ITEM_SPACING)
    const maxHeight = Math.max(48, viewportHeight - TIMELINE_MINIMAP_MAX_VERTICAL_CHROME)
    return Math.round(Math.min(naturalHeight, maxHeight))
}

function resolveTimelineMinimapTopPercent(index: number, itemCount: number): number {
    if (itemCount <= 1) return 0
    return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100
}

export function resolveTimelineMinimapIndexFromPointer(input: {
    itemCount: number
    railTop: number
    railHeight: number
    pointerY: number
}): number | null {
    if (input.itemCount <= 0 || input.railHeight <= 0) return null
    if (input.itemCount === 1) return 0
    const progress = Math.max(0, Math.min(1, (input.pointerY - input.railTop) / input.railHeight))
    return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))))
}

export function resolveTimelineMinimapMarkerWidth(hoverDistance: number | null): number {
    if (hoverDistance === 0) return 24
    if (hoverDistance === 1) return 17
    if (hoverDistance === 2) return 14
    return 12
}

function compactText(value: string, maxLength: number): string {
    const normalized = value
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[#>*_\[\]()]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

function getUserMessageTitle(message: AssistantMessage): string {
    const parsed = parseUserMessageAttachments(message.text || '')
    const body = compactText(parsed.body, 88)
    if (body) return body
    if (parsed.attachments.length === 1) return parsed.attachments[0].displayName || 'Attachment'
    if (parsed.attachments.length > 1) return `${parsed.attachments.length} attachments`
    return 'New prompt'
}

function getAssistantPreview(message: AssistantMessage | null): string | null {
    if (!message) return null
    const text = compactText(stripProposedPlanBlocks(message.text || ''), 155)
    return text || null
}

function getActivityPreview(activity: AssistantActivity | null): string | null {
    if (!activity) return null
    const title = getActivityTitle(activity)
    const detail = compactText(activity.summary || activity.detail || '', 120)
    if (detail && detail !== title) return `${title}: ${detail}`
    return title || null
}

function getElapsedLabel(
    turn: AssistantSessionTurnUsageEntry | null | undefined,
    fallbackStartedAt: string | null,
    running: boolean
): string | null {
    const startedAt = turn?.startedAt || turn?.requestedAt || fallbackStartedAt
    const completedAt = turn?.completedAt || (running ? new Date().toISOString() : null)
    if (!startedAt || !completedAt) return null
    const elapsed = formatWorkingTimer(startedAt, completedAt)
    if (!elapsed) return null
    return `${running ? 'Working for' : 'Worked for'} ${elapsed}`
}

function indexTimelineRowElements(root: HTMLElement): Map<string, HTMLElement> {
    const elementsById = new Map<string, HTMLElement>()
    const elements = root.querySelectorAll<HTMLElement>('[data-assistant-timeline-row-id]')
    for (const element of elements) {
        const rowId = element.dataset.assistantTimelineRowId
        if (rowId) elementsById.set(rowId, element)
    }
    return elementsById
}

function areMarkerMetricsEqual(
    left: Record<string, { scrollTop: number }>,
    right: Record<string, { scrollTop: number }>
): boolean {
    const leftIds = Object.keys(left)
    const rightIds = Object.keys(right)
    if (leftIds.length !== rightIds.length) return false
    return leftIds.every((rowId) => left[rowId]?.scrollTop === right[rowId]?.scrollTop)
}

function areRailGeometriesEqual(left: RailGeometry | null, right: RailGeometry): boolean {
    return Boolean(left)
        && left?.left === right.left
        && left.top === right.top
        && left.height === right.height
        && left.railHeight === right.railHeight
}

function findNextAssistant(rows: TimelineRenderRow[], startIndex: number, turnId: string | null): AssistantMessage | null {
    let fallback: AssistantMessage | null = null
    for (let index = startIndex + 1; index < rows.length; index += 1) {
        const row = rows[index]
        if (row.kind === 'message' && row.message.role === 'user') return fallback
        if (row.kind === 'message' && row.message.role === 'assistant') {
            if (turnId && row.message.turnId === turnId) return row.message
            if (!turnId) fallback = row.message
        }
    }
    return fallback
}

function findNextActivity(rows: TimelineRenderRow[], startIndex: number, turnId: string | null): AssistantActivity | null {
    for (let index = startIndex + 1; index < rows.length; index += 1) {
        const row = rows[index]
        if (row.kind === 'message' && row.message.role === 'user') return null
        if (row.kind === 'activity' && (!turnId || row.activity.turnId === turnId)) return row.activity
        if (
            row.kind === 'activity-group'
            || row.kind === 'thought-group'
            || row.kind === 'command-checkpoint-group'
            || row.kind === 'work-trace-group'
        ) {
            const activity = row.activities.find((entry) => !turnId || entry.turnId === turnId)
            if (activity) return activity
        }
    }
    return null
}

export function buildBaseCheckpoints(
    rows: TimelineRenderRow[],
    turnUsageById?: ReadonlyMap<string, AssistantSessionTurnUsageEntry>
): Omit<TimelineCheckpoint, 'markerTop' | 'scrollTop' | 'meta'>[] {
    return rows.flatMap((row, index) => {
        if (row.kind !== 'message' || row.message.role !== 'user') return []

        const turnId = row.message.turnId || null
        const assistantMessage = findNextAssistant(rows, index, turnId)
        const activity = findNextActivity(rows, index, turnId)
        const resolvedTurnId = turnId || assistantMessage?.turnId || activity?.turnId || null
        const running = Boolean(assistantMessage?.streaming)
            || Boolean(resolvedTurnId && turnUsageById?.get(resolvedTurnId)?.state === 'running')
        return [{
            id: `checkpoint-${row.id}`,
            rowId: row.id,
            title: getUserMessageTitle(row.message),
            detail: getAssistantPreview(assistantMessage) || getActivityPreview(activity),
            turnId: resolvedTurnId,
            running
        }]
    })
}

export const AssistantTimelineCheckpointRail = memo(function AssistantTimelineCheckpointRail({
    rows,
    rootRef,
    railHostRef,
    scrollContainerRef,
    turnUsageById,
    latestTurnStartedAt = null
}: {
    rows: TimelineRenderRow[]
    rootRef: RefObject<HTMLDivElement | null>
    railHostRef?: RefObject<HTMLDivElement | null>
    scrollContainerRef?: RefObject<HTMLDivElement | null>
    turnUsageById?: ReadonlyMap<string, AssistantSessionTurnUsageEntry>
    latestTurnStartedAt?: string | null
}) {
    const [railGeometry, setRailGeometry] = useState<RailGeometry | null>(null)
    const [markerMetrics, setMarkerMetrics] = useState<Record<string, { scrollTop: number }>>({})
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeHoverIndex, setActiveHoverIndex] = useState<number | null>(null)
    const activeIdRef = useRef<string | null>(null)
    const activeSyncFrameRef = useRef<number | null>(null)
    const wheelDeltaRef = useRef(0)
    const railButtonRef = useRef<HTMLButtonElement | null>(null)

    const baseCheckpoints = useMemo(
        () => buildBaseCheckpoints(rows, turnUsageById),
        [rows, turnUsageById]
    )
    const checkpointRowIds = useMemo(
        () => baseCheckpoints.map((checkpoint) => checkpoint.rowId),
        [baseCheckpoints]
    )
    const checkpointRowIdSignature = checkpointRowIds.join('\u0000')
    const checkpoints = useMemo<TimelineCheckpoint[]>(() => baseCheckpoints
        .map((checkpoint) => {
            const turn = checkpoint.turnId ? turnUsageById?.get(checkpoint.turnId) : null
            const metrics = markerMetrics[checkpoint.rowId]
            return {
                ...checkpoint,
                markerTop: 0,
                scrollTop: metrics?.scrollTop ?? 0,
                meta: getElapsedLabel(turn, latestTurnStartedAt, checkpoint.running)
            }
        })
        .filter((checkpoint) => Boolean(markerMetrics[checkpoint.rowId])), [
        baseCheckpoints,
        latestTurnStartedAt,
        markerMetrics,
        turnUsageById
    ])

    useLayoutEffect(() => {
        const root = rootRef.current
        const railHost = railHostRef?.current
        const scrollElement = scrollContainerRef?.current
        if (!root || !railHost || !scrollElement || baseCheckpoints.length === 0) {
            setMarkerMetrics({})
            setRailGeometry(null)
            return
        }

        let frameId: number | null = null
        const measure = () => {
            frameId = null
            const scrollRect = scrollElement.getBoundingClientRect()
            const hostRect = railHost.getBoundingClientRect()
            const rowElementsById = indexTimelineRowElements(root)
            const nextMetrics: Record<string, { scrollTop: number }> = {}
            for (const rowId of checkpointRowIds) {
                const rowElement = rowElementsById.get(rowId)
                if (!rowElement) continue
                nextMetrics[rowId] = { scrollTop: Math.max(0, rowElement.offsetTop - 18) }
            }
            const nextGeometry: RailGeometry = {
                left: TIMELINE_MINIMAP_PANE_INSET,
                top: Math.max(0, Math.round(scrollRect.top - hostRect.top)),
                height: Math.round(scrollRect.height),
                railHeight: resolveTimelineMinimapHeight(
                    Math.min(checkpointRowIds.length, TIMELINE_MINIMAP_MAX_MARKERS),
                    scrollRect.height
                )
            }
            setRailGeometry((current) => areRailGeometriesEqual(current, nextGeometry) ? current : nextGeometry)
            setMarkerMetrics((current) => areMarkerMetricsEqual(current, nextMetrics) ? current : nextMetrics)
        }
        const scheduleMeasure = () => {
            if (frameId !== null) return
            frameId = window.requestAnimationFrame(measure)
        }

        scheduleMeasure()
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null
        resizeObserver?.observe(root)
        resizeObserver?.observe(railHost)
        resizeObserver?.observe(scrollElement)
        window.addEventListener('resize', scheduleMeasure)
        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId)
            resizeObserver?.disconnect()
            window.removeEventListener('resize', scheduleMeasure)
        }
    }, [checkpointRowIdSignature, railHostRef, rootRef, scrollContainerRef])

    useEffect(() => {
        const scrollElement = scrollContainerRef?.current
        if (!scrollElement || checkpoints.length === 0) return
        const syncActiveCheckpoint = () => {
            activeSyncFrameRef.current = null
            const anchorTop = scrollElement.scrollTop + Math.min(scrollElement.clientHeight * 0.34, 220)
            let current = checkpoints[0]
            for (const checkpoint of checkpoints) {
                if (checkpoint.scrollTop <= anchorTop + 8) current = checkpoint
                else break
            }
            if (activeIdRef.current === current.id) return
            activeIdRef.current = current.id
            setActiveId(current.id)
        }
        const scheduleActiveCheckpointSync = () => {
            if (activeSyncFrameRef.current !== null) return
            activeSyncFrameRef.current = window.requestAnimationFrame(syncActiveCheckpoint)
        }
        syncActiveCheckpoint()
        scrollElement.addEventListener('scroll', scheduleActiveCheckpointSync, { passive: true })
        window.addEventListener('resize', scheduleActiveCheckpointSync)
        return () => {
            if (activeSyncFrameRef.current !== null) {
                window.cancelAnimationFrame(activeSyncFrameRef.current)
                activeSyncFrameRef.current = null
            }
            scrollElement.removeEventListener('scroll', scheduleActiveCheckpointSync)
            window.removeEventListener('resize', scheduleActiveCheckpointSync)
        }
    }, [checkpoints, scrollContainerRef])

    const railHost = railHostRef?.current
    const activeCheckpointIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === activeId)
    const windowCenterIndex = activeCheckpointIndex >= 0 ? activeCheckpointIndex : checkpoints.length - 1
    const minimapWindow = resolveTimelineMinimapWindow(checkpoints.length, windowCenterIndex)
    const displayedCheckpoints = checkpoints.slice(minimapWindow.startIndex, minimapWindow.endIndex)
    const resolvedHoverIndex = activeHoverIndex !== null && activeHoverIndex < checkpoints.length ? activeHoverIndex : null
    const hoveredCheckpoint = resolvedHoverIndex === null ? null : checkpoints[resolvedHoverIndex] || null
    const hoverDisplayIndex = resolvedHoverIndex === null
        ? null
        : resolvedHoverIndex - minimapWindow.startIndex
    const hoverCardTop = hoverDisplayIndex !== null && hoverDisplayIndex >= 0 && hoverDisplayIndex < displayedCheckpoints.length
        ? (resolveTimelineMinimapTopPercent(hoverDisplayIndex, displayedCheckpoints.length) / 100) * (railGeometry?.railHeight ?? 0)
        : (railGeometry?.railHeight ?? 0) / 2
    const hoverCardTranslate = hoverDisplayIndex === null
        ? '-50%'
        : hoverDisplayIndex <= 0 ? '0%' : hoverDisplayIndex >= displayedCheckpoints.length - 1 ? '-100%' : '-50%'
    const scrollToCheckpoint = (checkpoint: TimelineCheckpoint | null) => {
        const scrollElement = scrollContainerRef?.current
        if (!scrollElement || !checkpoint) return
        scrollElement.dispatchEvent(new CustomEvent('assistant:timeline-user-jump'))
        scrollElement.scrollTo({ top: Math.max(0, checkpoint.scrollTop), behavior: 'smooth' })
    }
    const resolveHoverIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const displayIndex = resolveTimelineMinimapIndexFromPointer({
            itemCount: displayedCheckpoints.length,
            railTop: rect.top,
            railHeight: rect.height,
            pointerY: event.clientY
        })
        return displayIndex === null ? null : minimapWindow.startIndex + displayIndex
    }
    const moveHoverIndex = (delta: number) => {
        setActiveHoverIndex((current) => Math.max(0, Math.min(
            checkpoints.length - 1,
            (current ?? (activeCheckpointIndex >= 0 ? activeCheckpointIndex : minimapWindow.startIndex)) + delta
        )))
    }
    const handleWheel = (event: WheelEvent) => {
        event.preventDefault()
        event.stopPropagation()
        wheelDeltaRef.current += event.deltaY
        if (Math.abs(wheelDeltaRef.current) < TIMELINE_MINIMAP_WHEEL_STEP_PX) return

        const direction = wheelDeltaRef.current > 0 ? 1 : -1
        wheelDeltaRef.current -= direction * TIMELINE_MINIMAP_WHEEL_STEP_PX
        const currentIndex = resolvedHoverIndex ?? (activeCheckpointIndex >= 0 ? activeCheckpointIndex : windowCenterIndex)
        const nextIndex = Math.max(0, Math.min(checkpoints.length - 1, currentIndex + direction))
        setActiveHoverIndex(nextIndex)
        scrollToCheckpoint(checkpoints[nextIndex] || null)
    }

    useEffect(() => {
        const button = railButtonRef.current
        if (!button || !railGeometry || checkpoints.length < TIMELINE_MINIMAP_MIN_ITEMS) return
        button.addEventListener('wheel', handleWheel, { passive: false })
        return () => button.removeEventListener('wheel', handleWheel)
    }, [activeCheckpointIndex, checkpoints, railGeometry, resolvedHoverIndex, windowCenterIndex])

    if (!railHost || !railGeometry || checkpoints.length < TIMELINE_MINIMAP_MIN_ITEMS) return null

    const railNode = (
        <div
            data-assistant-checkpoint-rail="true"
            className="pointer-events-none absolute z-30 block w-[72px]"
            style={{ left: railGeometry.left, top: railGeometry.top, height: railGeometry.height }}
        >
            <button
                ref={railButtonRef}
                type="button"
                aria-label={`Jump to message: ${hoveredCheckpoint?.title ?? 'User message'}`}
                className="pointer-events-auto absolute left-2 top-1/2 w-10 -translate-y-1/2 cursor-pointer overscroll-contain bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                onBlur={() => setActiveHoverIndex(null)}
                onClick={(event) => {
                    const nextIndex = resolveHoverIndexFromPointer(event)
                    scrollToCheckpoint(nextIndex === null ? null : checkpoints[nextIndex] || null)
                    event.currentTarget.blur()
                }}
                onFocus={() => setActiveHoverIndex((current) => current ?? (activeCheckpointIndex >= 0 ? activeCheckpointIndex : minimapWindow.startIndex))}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') { event.preventDefault(); moveHoverIndex(1) }
                    else if (event.key === 'ArrowUp') { event.preventDefault(); moveHoverIndex(-1) }
                    else if (event.key === 'Home') { event.preventDefault(); setActiveHoverIndex(0) }
                    else if (event.key === 'End') { event.preventDefault(); setActiveHoverIndex(checkpoints.length - 1) }
                    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); scrollToCheckpoint(hoveredCheckpoint) }
                }}
                onMouseLeave={() => {
                    wheelDeltaRef.current = 0
                    setActiveHoverIndex(null)
                }}
                onMouseMove={(event) => setActiveHoverIndex(resolveHoverIndexFromPointer(event))}
                onMouseDown={(event) => event.preventDefault()}
                style={{ height: railGeometry.railHeight }}
            >
                {minimapWindow.hiddenBefore > 0 ? (
                    <span aria-hidden="true" className="pointer-events-none absolute -top-4 left-0 text-[8px] font-medium leading-3 text-white/32">
                        ↑ {minimapWindow.hiddenBefore}
                    </span>
                ) : null}
                {displayedCheckpoints.map((checkpoint, displayIndex) => {
                    const checkpointIndex = minimapWindow.startIndex + displayIndex
                    const inView = activeId === checkpoint.id
                    const hoverDistance = resolvedHoverIndex === null ? null : Math.abs(checkpointIndex - resolvedHoverIndex)
                    const currentDistance = activeCheckpointIndex >= 0 ? Math.abs(checkpointIndex - activeCheckpointIndex) : null
                    const nearCurrent = currentDistance !== null && currentDistance > 0 && currentDistance <= 2
                    const markerWidth = resolveTimelineMinimapMarkerWidth(hoverDistance)
                    const markerOpacity = inView
                        ? 1
                        : nearCurrent ? 0.82 : hoverDistance === 0 ? 0.88 : hoverDistance === 1 ? 0.78 : hoverDistance === 2 ? 0.7 : resolvedHoverIndex === null ? 0.68 : 0.52
                    return (
                        <span
                            key={checkpoint.id}
                            aria-hidden="true"
                            data-assistant-checkpoint-marker={checkpoint.id}
                            className={cn(
                                'pointer-events-none absolute left-0 h-[2px] -translate-y-1/2 rounded-full transition-[top,width,background-color,opacity,box-shadow] duration-150 ease-out',
                                inView ? 'bg-white/85 shadow-[0_0_10px_rgba(255,255,255,0.16)]' : nearCurrent ? 'bg-white/60' : 'bg-white/45',
                                checkpoint.running && 'bg-sky-200/65'
                            )}
                            style={{
                                top: `${resolveTimelineMinimapTopPercent(displayIndex, displayedCheckpoints.length)}%`,
                                width: markerWidth,
                                opacity: markerOpacity
                            }}
                        />
                    )
                })}
                {minimapWindow.hiddenAfter > 0 ? (
                    <span aria-hidden="true" className="pointer-events-none absolute -bottom-4 left-0 text-[8px] font-medium leading-3 text-white/32">
                        ↓ {minimapWindow.hiddenAfter}
                    </span>
                ) : null}
            </button>
            {hoveredCheckpoint ? (
                <div
                    className="pointer-events-none absolute left-12 w-[320px] max-w-[min(320px,calc(100vw-108px))] overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#1b1829]/95 px-3 py-2.5 text-left shadow-[0_20px_56px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl transition-[top] duration-150 ease-out"
                    style={{
                        top: `calc(50% - ${railGeometry.railHeight / 2}px + ${hoverCardTop}px)`,
                        transform: `translateY(${hoverCardTranslate})`
                    }}
                >
                    {hoveredCheckpoint.meta ? (
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-sparkle-text-muted/75">
                            <span>{hoveredCheckpoint.meta}</span>
                            <span className="text-sparkle-text-muted/45">&gt;</span>
                        </div>
                    ) : null}
                    <div className="truncate text-[12px] font-semibold leading-5 text-sparkle-text">{hoveredCheckpoint.title}</div>
                    {hoveredCheckpoint.detail ? (
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-sparkle-text-secondary/75">{hoveredCheckpoint.detail}</div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )

    return createPortal(railNode, railHost)
})
