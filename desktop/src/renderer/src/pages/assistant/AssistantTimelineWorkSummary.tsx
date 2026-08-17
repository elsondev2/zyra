import { memo, startTransition, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWorkingTimer } from './assistant-timeline-helpers'
import { requestAssistantTimelineDisclosureAnchor } from './assistant-timeline-scroll-events'

const WORK_SUMMARY_LAYOUT_SETTLE_MS = 180

function formatWorkSummaryStatus(startedAt: string, completedAt: string | null, running: boolean): string {
    const elapsed = formatWorkingTimer(
        startedAt,
        running ? new Date().toISOString() : completedAt || new Date().toISOString()
    )
    return elapsed
        ? `${running ? 'Working' : 'Worked'} for ${elapsed}`
        : running ? 'Working' : 'Worked'
}

export const TimelineTurnWorkSummary = memo(function TimelineTurnWorkSummary({
    startedAt,
    completedAt,
    running = false,
    outcome = null,
    renderChildren,
    renderLiveNarration
}: {
    startedAt: string
    completedAt: string | null
    running?: boolean
    outcome?: 'completed' | 'interrupted' | 'failed' | 'no-response' | null
    renderChildren: () => ReactNode
    renderLiveNarration?: (expanded: boolean) => ReactNode
}) {
    const [expanded, setExpanded] = useState(running)
    const [contentMounted, setContentMounted] = useState(running)
    const panelId = useId()
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const statusTextRef = useRef<HTMLSpanElement | null>(null)
    const previousRunningRef = useRef(running)
    const contentMountFrameRef = useRef<number | null>(null)
    const statusText = formatWorkSummaryStatus(startedAt, completedAt, running)
    useEffect(() => {
        const updateStatusText = () => {
            if (statusTextRef.current) {
                statusTextRef.current.textContent = formatWorkSummaryStatus(startedAt, completedAt, running)
            }
        }
        updateStatusText()
        if (!running) return
        const intervalId = window.setInterval(updateStatusText, 1000)
        return () => window.clearInterval(intervalId)
    }, [completedAt, running, startedAt])
    const outcomeLabel = outcome === 'interrupted'
        ? 'Interrupted'
        : outcome === 'failed'
            ? 'Failed'
            : outcome === 'no-response'
                ? 'No response'
                : null
    const setWorkExpanded = (nextExpanded: boolean, anchor: HTMLElement | null) => {
        if (contentMountFrameRef.current !== null) {
            window.cancelAnimationFrame(contentMountFrameRef.current)
            contentMountFrameRef.current = null
        }
        setExpanded(nextExpanded)
        if (nextExpanded) {
            contentMountFrameRef.current = window.requestAnimationFrame(() => {
                contentMountFrameRef.current = null
                requestAssistantTimelineDisclosureAnchor(anchor, WORK_SUMMARY_LAYOUT_SETTLE_MS, true)
                startTransition(() => setContentMounted(true))
            })
        } else {
            requestAssistantTimelineDisclosureAnchor(anchor, WORK_SUMMARY_LAYOUT_SETTLE_MS, false)
            setContentMounted(false)
        }
    }

    useEffect(() => {
        const wasRunning = previousRunningRef.current
        previousRunningRef.current = running
        if (!wasRunning && running) {
            if (contentMountFrameRef.current !== null) window.cancelAnimationFrame(contentMountFrameRef.current)
            contentMountFrameRef.current = null
            setContentMounted(true)
            setExpanded(true)
            return
        }
        if (!wasRunning || running) return
        if (contentMountFrameRef.current !== null) window.cancelAnimationFrame(contentMountFrameRef.current)
        contentMountFrameRef.current = null
        requestAssistantTimelineDisclosureAnchor(triggerRef.current, WORK_SUMMARY_LAYOUT_SETTLE_MS, false)
        setExpanded(false)
        setContentMounted(false)
    }, [running])

    useEffect(() => () => {
        if (contentMountFrameRef.current !== null) window.cancelAnimationFrame(contentMountFrameRef.current)
    }, [])

    return (
        <div className="max-w-4xl py-0.5">
            <div className={cn(
                'transition-[background-color,backdrop-filter] duration-150',
                expanded && 'sticky top-0 z-10 bg-sparkle-bg/95 backdrop-blur-md'
            )}>
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setWorkExpanded(!expanded, triggerRef.current)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="group/work inline-flex min-h-7 items-center gap-1 rounded-sm pr-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                    title={expanded ? 'Hide work' : 'Show work'}
                >
                    <span ref={statusTextRef} className="shrink-0 text-[11px] font-medium text-white/32 transition-colors group-hover/work:text-white/48">
                        {statusText}
                    </span>
                    {outcomeLabel ? (
                        <span className={cn(
                            'shrink-0 text-[10px] font-medium',
                            outcome === 'failed' ? 'text-red-300/55' : outcome === 'interrupted' ? 'text-amber-200/50' : 'text-white/25'
                        )}>
                            · {outcomeLabel}
                        </span>
                    ) : null}
                    <ChevronRight
                        size={12}
                        aria-hidden="true"
                        className={cn('shrink-0 text-white/20 transition-[transform,color] duration-150 ease-out group-hover/work:text-white/35 motion-reduce:transition-none', expanded && 'rotate-90')}
                    />
                </button>
                <div className="h-px w-full bg-white/[0.07]" aria-hidden="true" />
            </div>
            {expanded && contentMounted ? (
                <div id={panelId} className="pt-2">
                    {renderChildren()}
                </div>
            ) : null}
            {renderLiveNarration ? renderLiveNarration(expanded) : null}
        </div>
    )
})
