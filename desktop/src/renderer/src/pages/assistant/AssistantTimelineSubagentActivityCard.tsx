import { memo, useMemo, useState } from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import { formatAssistantDateTime } from '@/lib/assistant/selectors'
import {
    areActivitiesEquivalent,
    getActivityElapsed,
    getActivityStatus,
    getActivityTitle,
    getSubagentActivityModel,
    getSubagentActivityPrompt,
    getSubagentActivityReasoning,
    getSubagentActivityTargets,
    getSubagentActivityThreadLabels
} from './assistant-timeline-helpers'

export const TimelineSubagentActivityCard = memo(({
    activity
}: {
    activity: AssistantActivity
}) => {
    const [expanded, setExpanded] = useState(activity.kind === 'subagent.send-input')
    const title = useMemo(() => getActivityTitle(activity), [activity])
    const status = useMemo(() => getActivityStatus(activity), [activity])
    const elapsed = useMemo(() => getActivityElapsed(activity), [activity])
    const targets = useMemo(() => getSubagentActivityTargets(activity), [activity])
    const prompt = useMemo(() => getSubagentActivityPrompt(activity), [activity])
    const model = useMemo(() => getSubagentActivityModel(activity), [activity])
    const reasoning = useMemo(() => getSubagentActivityReasoning(activity), [activity])
    const threadLabels = useMemo(() => getSubagentActivityThreadLabels(activity), [activity])
    const hasExpandedContent = Boolean(prompt || model || reasoning || threadLabels.length > 0)

    return (
        <div className="px-2 py-1.5">
            <div className="overflow-hidden rounded-xl border border-violet-400/15 bg-violet-500/[0.05]">
                <button
                    type="button"
                    onClick={() => {
                        if (hasExpandedContent) setExpanded((current) => !current)
                    }}
                    className={cn(
                        'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors',
                        hasExpandedContent && 'hover:bg-white/[0.02]'
                    )}
                >
                    <span className={cn(
                        'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                        status === 'running'
                            ? 'border-sky-400/20 bg-sky-500/[0.12] text-sky-200'
                            : status === 'failed'
                                ? 'border-red-400/20 bg-red-500/[0.12] text-red-200'
                                : 'border-violet-400/20 bg-violet-500/[0.14] text-violet-100'
                    )}>
                        <Bot size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-sparkle-text">{title}</p>
                            <span className={cn(
                                'rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em]',
                                status === 'running'
                                    ? 'bg-sky-500/[0.12] text-sky-200'
                                    : status === 'failed'
                                        ? 'bg-red-500/[0.12] text-red-200'
                                        : 'bg-violet-500/[0.12] text-violet-100'
                            )}>
                                {status === 'running' ? 'Running' : status === 'failed' ? 'Failed' : 'Completed'}
                            </span>
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-sparkle-text-muted/65">
                            {targets.length > 0 ? <span className="truncate">Targets: {targets.join(', ')}</span> : null}
                            {elapsed ? <span>{elapsed}</span> : null}
                            {!targets.length && !elapsed ? <span>Subagent orchestration event</span> : null}
                        </div>
                    </div>
                    {hasExpandedContent ? (
                        <ChevronDown size={12} className={cn('mt-1 shrink-0 text-white/20 transition-transform', expanded && 'rotate-180')} />
                    ) : null}
                </button>
                <AnimatedHeight isOpen={expanded && hasExpandedContent} duration={220}>
                    <div className="border-t border-white/[0.05] px-3 pb-3 pt-2">
                        <p className="text-[10px] text-white/25">{formatAssistantDateTime(activity.createdAt)}</p>
                        {threadLabels.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {threadLabels.map((entry, index) => (
                                    <span
                                        key={`${activity.id}-target-${entry.threadId || index}`}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/20 px-2 py-1 text-[10px] text-sparkle-text-secondary"
                                        title={entry.role || entry.nickname || entry.label}
                                    >
                                        <span className={cn(
                                            'h-1.5 w-1.5 rounded-full',
                                            entry.state === 'running' || entry.state === 'waiting' ? 'bg-sky-400'
                                                : entry.state === 'error' ? 'bg-red-400'
                                                    : 'bg-violet-300'
                                        )} />
                                        <span className="max-w-[220px] truncate">{entry.label}</span>
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {prompt ? (
                            <div className="mt-2 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2">
                                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/18">Prompt</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-sparkle-text-secondary">{prompt}</p>
                            </div>
                        ) : null}
                        {model || reasoning ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {model ? <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-sparkle-text-secondary">Model: {model}</span> : null}
                                {reasoning ? <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-sparkle-text-secondary">Reasoning: {reasoning}</span> : null}
                            </div>
                        ) : null}
                    </div>
                </AnimatedHeight>
            </div>
        </div>
    )
}, (prev, next) => areActivitiesEquivalent(prev.activity, next.activity))
