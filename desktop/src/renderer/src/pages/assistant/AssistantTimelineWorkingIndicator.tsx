import { useEffect, useRef } from 'react'
import { formatWorkingTimer } from './assistant-timeline-helpers'

function formatWorkingIndicatorStatus(startedAt: string | null | undefined, label: string): string {
    if (label === 'Letting compaction finish') return label
    const elapsed = startedAt ? formatWorkingTimer(startedAt, new Date().toISOString()) : null
    return elapsed ? `${label === 'Connecting...' ? 'Connecting' : 'Working'} for ${elapsed}` : label
}

export function TimelineWorkingIndicator({ startedAt, label = 'Working...' }: { startedAt?: string | null; label?: string }) {
    const statusTextRef = useRef<HTMLSpanElement | null>(null)
    const statusText = formatWorkingIndicatorStatus(startedAt, label)
    useEffect(() => {
        const updateStatusText = () => {
            if (statusTextRef.current) {
                statusTextRef.current.textContent = formatWorkingIndicatorStatus(startedAt, label)
            }
        }
        updateStatusText()
        if (!startedAt) return
        const intervalId = window.setInterval(updateStatusText, 1000)
        return () => window.clearInterval(intervalId)
    }, [label, startedAt])
    return (
        <div className="max-w-4xl py-0.5" data-assistant-working-indicator="true">
            <div className="inline-flex min-h-7 items-center gap-1 text-[11px] text-white/32">
                <span data-assistant-working-dots="true" className="mr-0.5 inline-flex shrink-0 items-center gap-[3px]" aria-hidden="true">
                    <span className="h-1 w-1 rounded-full bg-white/25 motion-safe:animate-pulse" />
                    <span className="h-1 w-1 rounded-full bg-white/25 motion-safe:animate-pulse [animation-delay:200ms]" />
                    <span className="h-1 w-1 rounded-full bg-white/25 motion-safe:animate-pulse [animation-delay:400ms]" />
                </span>
                <span ref={statusTextRef} className="shrink-0 font-medium">{statusText}</span>
            </div>
        </div>
    )
}
