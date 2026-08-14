import { memo, useEffect, useRef } from 'react'
import { Check, CircleStop, LoaderCircle, X } from 'lucide-react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { getActivityElapsed } from './assistant-timeline-helpers'

type VoiceTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled'

function getVoiceTaskStatus(activity: AssistantActivity): VoiceTaskStatus {
    const status = String(activity.payload?.status || '').trim()
    if (status === 'completed' || status === 'failed' || status === 'cancelled') return status
    return 'running'
}

function formatVoiceTaskStatus(activity: AssistantActivity, nowIso?: string): string {
    const status = getVoiceTaskStatus(activity)
    const elapsed = getActivityElapsed(activity, status === 'running' ? nowIso || new Date().toISOString() : null)
    const state = status === 'completed'
        ? 'finished'
        : status === 'failed'
            ? 'failed'
            : status === 'cancelled'
                ? 'stopped'
                : 'working'
    return `Primary agent ${state}${elapsed ? ` · ${elapsed}` : ''}`
}

export const TimelineVoiceTaskStatus = memo(function TimelineVoiceTaskStatus({
    activity
}: {
    activity: AssistantActivity
}) {
    const status = getVoiceTaskStatus(activity)
    const statusRef = useRef<HTMLSpanElement | null>(null)

    useEffect(() => {
        const update = () => {
            if (statusRef.current) statusRef.current.textContent = formatVoiceTaskStatus(activity)
        }
        update()
        if (status !== 'running') return
        const intervalId = window.setInterval(update, 1000)
        return () => window.clearInterval(intervalId)
    }, [activity, status])

    const Icon = status === 'completed'
        ? Check
        : status === 'failed'
            ? X
            : status === 'cancelled'
                ? CircleStop
                : LoaderCircle

    return (
        <div
            className="flex min-h-8 max-w-4xl items-center gap-2 py-0.5"
            role="status"
            aria-live="polite"
            aria-label={formatVoiceTaskStatus(activity)}
        >
            <Icon
                size={12}
                aria-hidden="true"
                className={cn(
                    'shrink-0',
                    status === 'running' && 'animate-spin text-cyan-200/55 motion-reduce:animate-none',
                    status === 'completed' && 'text-emerald-200/55',
                    status === 'failed' && 'text-red-300/60',
                    status === 'cancelled' && 'text-amber-200/55'
                )}
            />
            <span
                ref={statusRef}
                className={cn(
                    'shrink-0 text-[11px] font-medium',
                    status === 'failed' ? 'text-red-200/55' : status === 'cancelled' ? 'text-amber-100/50' : 'text-white/34'
                )}
            >
                {formatVoiceTaskStatus(activity)}
            </span>
            <span className="h-px min-w-8 flex-1 bg-white/[0.07]" aria-hidden="true" />
        </div>
    )
})
