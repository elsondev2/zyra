import { memo, useEffect, useLayoutEffect, useMemo, useState, type MouseEvent, type RefObject } from 'react'
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

function findTimelineRowElement(root: HTMLElement, rowId: string): HTMLElement | null {
    const elements = root.querySelectorAll<HTMLElement>('[data-assistant-timeline-row-id]')
    for (const element of Array.from(elements)) {
        if (element.dataset.assistantTimelineRowId === rowId) return element
    }
    return null
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

    const baseCheckpoints = useMemo(
        () => buildBaseCheckpoints(rows, turnUsageById),
        [rows, turnUsageById]
    )
    const checkpoints = useMemo<TimelineCheckpoint[]>(() => baseCheckpoints
        .map((checkpoint, index) => {
            const turn = checkpoint.turnId ? turnUsageById?.get(checkpoint.turnId) : null
            const metrics = markerMetrics[checkpoint.rowId]
            const markerTop = railGeometry
                ? (resolveTimelineMinimapTopPercent(index, baseCheckpoints.length) / 100) * railGeometry.railHeight
                : 0
            return {
                ...checkpoint,
                markerTop,
                scrollTop: metrics?.scrollTop ?? 0,
                meta: getElapsedLabel(turn, latestTurnStartedAt, checkpoint.running)
            }
        })
        .filter((checkpoint) => Boolean(markerMetrics[checkpoint.rowId])), [
        baseCheckpoints,
        latestTurnStartedAt,
        markerMetrics,
        railGeometry,
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
            const next: Record<string, { scrollTop: number }> = {}
            for (const checkpoint of baseCheckpoints) {
                const rowElement = findTimelineRowElement(root, checkpoint.rowId)
                if (!rowElement) continue
                next[checkpoint.rowId] = { scrollTop: Math.max(0, rowElement.offsetTop - 18) }
            }
            setRailGeometry({
                left: TIMELINE_MINIMAP_PANE_INSET,
                top: Math.max(0, Math.round(scrollRect.top - hostRect.top)),
                height: Math.round(scrollRect.height),
                railHeight: resolveTimelineMinimapHeight(baseCheckpoints.length, scrollRect.height)
            })
            setMarkerMetrics(next)
        }
        const scheduleMeasure = () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId)
            frameId = window.requestAnimationFrame(measure)
        }

        scheduleMeasure()
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null
        resizeObserver?.observe(root)
        resizeObserver?.observe(railHost)
        resizeObserver?.observe(scrollElement)
        const mutationObserver = typeof MutationObserver !== 'undefined'
            ? new MutationObserver(scheduleMeasure)
            : null
        mutationObserver?.observe(root, { childList: true, subtree: true })
        window.addEventListener('resize', scheduleMeasure)
        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId)
            resizeObserver?.disconnect()
            mutationObserver?.disconnect()
            window.removeEventListener('resize', scheduleMeasure)
        }
    }, [baseCheckpoints, railHostRef, rootRef, scrollContainerRef])

    useEffect(() => {
        const scrollElement = scrollContainerRef?.current
        if (!scrollElement || checkpoints.length === 0) return
        const syncActiveCheckpoint = () => {
            const anchorTop = scrollElement.scrollTop + Math.min(scrollElement.clientHeight * 0.34, 220)
            let current = checkpoints[0]
            for (const checkpoint of checkpoints) {
                if (checkpoint.scrollTop <= anchorTop + 8) current = checkpoint
                else break
            }
            setActiveId(current.id)
        }
        syncActiveCheckpoint()
        scrollElement.addEventListener('scroll', syncActiveCheckpoint, { passive: true })
        window.addEventListener('resize', syncActiveCheckpoint)
        return () => {
            scrollElement.removeEventListener('scroll', syncActiveCheckpoint)
            window.removeEventListener('resize', syncActiveCheckpoint)
        }
    }, [checkpoints, scrollContainerRef])

    const railHost = railHostRef?.current
    if (!railHost || !railGeometry || checkpoints.length < TIMELINE_MINIMAP_MIN_ITEMS) return null

    const resolvedHoverIndex = activeHoverIndex !== null && activeHoverIndex < checkpoints.length ? activeHoverIndex : null
    const hoveredCheckpoint = resolvedHoverIndex === null ? null : checkpoints[resolvedHoverIndex] || null
    const activeCheckpointIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === activeId)
    const hoverCardTop = hoveredCheckpoint?.markerTop ?? 0
    const hoverCardTranslate = resolvedHoverIndex === null
        ? '-50%'
        : resolvedHoverIndex === 0 ? '0%' : resolvedHoverIndex === checkpoints.length - 1 ? '-100%' : '-50%'
    const scrollToCheckpoint = (checkpoint: TimelineCheckpoint | null) => {
        const scrollElement = scrollContainerRef?.current
        if (!scrollElement || !checkpoint) return
        scrollElement.dispatchEvent(new CustomEvent('assistant:timeline-user-jump'))
        scrollElement.scrollTo({ top: Math.max(0, checkpoint.scrollTop), behavior: 'smooth' })
    }
    const resolveHoverIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        return resolveTimelineMinimapIndexFromPointer({
            itemCount: checkpoints.length,
            railTop: rect.top,
            railHeight: rect.height,
            pointerY: event.clientY
        })
    }
    const moveHoverIndex = (delta: number) => {
        setActiveHoverIndex((current) => Math.max(0, Math.min(checkpoints.length - 1, (current ?? 0) + delta)))
    }

    const railNode = (
        <div
            data-assistant-checkpoint-rail="true"
            className="pointer-events-none absolute z-30 block w-[72px]"
            style={{ left: railGeometry.left, top: railGeometry.top, height: railGeometry.height }}
        >
            <button
                type="button"
                aria-label={`Jump to message: ${hoveredCheckpoint?.title ?? 'User message'}`}
                className="pointer-events-auto absolute left-2 top-1/2 w-10 -translate-y-1/2 cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                onBlur={() => setActiveHoverIndex(null)}
                onClick={(event) => {
                    const nextIndex = resolveHoverIndexFromPointer(event)
                    scrollToCheckpoint(nextIndex === null ? null : checkpoints[nextIndex] || null)
                    event.currentTarget.blur()
                }}
                onFocus={() => setActiveHoverIndex((current) => current ?? 0)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') { event.preventDefault(); moveHoverIndex(1) }
                    else if (event.key === 'ArrowUp') { event.preventDefault(); moveHoverIndex(-1) }
                    else if (event.key === 'Home') { event.preventDefault(); setActiveHoverIndex(0) }
                    else if (event.key === 'End') { event.preventDefault(); setActiveHoverIndex(checkpoints.length - 1) }
                    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); scrollToCheckpoint(hoveredCheckpoint) }
                }}
                onMouseLeave={() => setActiveHoverIndex(null)}
                onMouseMove={(event) => setActiveHoverIndex(resolveHoverIndexFromPointer(event))}
                onMouseDown={(event) => event.preventDefault()}
                style={{ height: railGeometry.railHeight }}
            >
                {checkpoints.map((checkpoint, index) => {
                    const inView = activeId === checkpoint.id
                    const hoverDistance = resolvedHoverIndex === null ? null : Math.abs(index - resolvedHoverIndex)
                    const currentDistance = activeCheckpointIndex >= 0 ? Math.abs(index - activeCheckpointIndex) : null
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
                                'pointer-events-none absolute left-0 h-[2px] -translate-y-1/2 rounded-full transition-[width,background-color,opacity,box-shadow] duration-150 ease-out',
                                inView ? 'bg-white/85 shadow-[0_0_10px_rgba(255,255,255,0.16)]' : nearCurrent ? 'bg-white/60' : 'bg-white/45',
                                checkpoint.running && 'bg-sky-200/65'
                            )}
                            style={{ top: checkpoint.markerTop, width: markerWidth, opacity: markerOpacity }}
                        />
                    )
                })}
            </button>
            {hoveredCheckpoint ? (
                <div
                    className="pointer-events-none absolute left-12 w-[320px] max-w-[min(320px,calc(100vw-108px))] overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#1b1829]/95 px-3 py-2.5 text-left shadow-[0_20px_56px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl"
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
