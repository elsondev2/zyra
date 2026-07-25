import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import { formatWorkingTimer } from './assistant-timeline-helpers'
import { requestAssistantTimelineDisclosureAnchor } from './assistant-timeline-scroll-events'

const WORK_SUMMARY_MOTION_MS = 320

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
    children,
    renderLiveNarration
}: {
    startedAt: string
    completedAt: string | null
    running?: boolean
    outcome?: 'completed' | 'interrupted' | 'failed' | 'no-response' | null
    children: ReactNode
    renderLiveNarration?: (expanded: boolean) => ReactNode
}) {
    const [expanded, setExpanded] = useState(running)
    const panelId = useId()
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const statusTextRef = useRef<HTMLSpanElement | null>(null)
    const previousRunningRef = useRef(running)
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
        requestAssistantTimelineDisclosureAnchor(anchor, WORK_SUMMARY_MOTION_MS, nextExpanded)
        setExpanded(nextExpanded)
    }

    useEffect(() => {
        const wasRunning = previousRunningRef.current
        previousRunningRef.current = running
        if (!wasRunning || running) return
        requestAssistantTimelineDisclosureAnchor(triggerRef.current, WORK_SUMMARY_MOTION_MS, false)
        setExpanded(false)
    }, [running])

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
                        className={cn('shrink-0 text-white/20 transition-[transform,color] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover/work:text-white/35', expanded && 'rotate-90')}
                    />
                </button>
                <div className="h-px w-full bg-white/[0.07]" aria-hidden="true" />
            </div>
            <AnimatedHeight isOpen={expanded} duration={WORK_SUMMARY_MOTION_MS} crispContent>
                <div id={panelId} className="pt-2">
                    {children}
                </div>
            </AnimatedHeight>
            {renderLiveNarration ? renderLiveNarration(expanded) : null}
        </div>
    )
})
