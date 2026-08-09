import { useMemo, type ReactNode } from 'react'
import { Avatar, Style } from '@dicebear/core'
import loopsDefinition from '@dicebear/styles/loops.json'
import wavesDefinition from '@dicebear/styles/waves.json'
import { Pause, Play, RotateCcw, Save, Square } from 'lucide-react'
import type { WorkflowNodeStatus, WorkflowRunState, WorkflowRunStatus } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { resolveAssistantWorkflowIdentity } from './assistant-workflow-presentation'

export type AssistantWorkflowAction = 'pause' | 'resume' | 'stop' | 'restart' | 'save'

const LOOPS_STYLE = new Style(loopsDefinition)
const WAVES_STYLE = new Style(wavesDefinition)

export function AssistantWorkflowAvatar({
    run,
    size,
    className
}: {
    run: Pick<WorkflowRunState, 'workflowRunId' | 'definitionName'>
    size: number
    className?: string
}) {
    const identity = resolveAssistantWorkflowIdentity(run)
    const style = identity.avatarStyle === 'loops' ? LOOPS_STYLE : WAVES_STYLE
    const avatarUri = useMemo(() => new Avatar(style, {
        seed: identity.seed,
        size,
        borderRadius: 14,
        scale: 9.4
    }).toDataUri(), [identity.seed, size, style])
    return (
        <span
            role="img"
            aria-label={`${identity.name} workflow`}
            className={cn('inline-flex shrink-0 overflow-hidden rounded-lg bg-transparent', className)}
            style={{ width: size, height: size }}
            data-dicebear-style={identity.avatarStyle}
        >
            <img src={avatarUri} alt="" width={size} height={size} draggable={false} className="size-full select-none object-cover" />
        </span>
    )
}

const STATUS_STYLES: Record<WorkflowRunStatus | WorkflowNodeStatus, { badge: string; dot: string; pulse?: boolean }> = {
    draft: { badge: 'bg-white/[0.03] text-sparkle-text-muted/60', dot: 'bg-white/30' },
    'awaiting-approval': { badge: 'bg-amber-400/[0.07] text-amber-100/75', dot: 'bg-amber-300', pulse: true },
    queued: { badge: 'bg-white/[0.035] text-sparkle-text-muted/70', dot: 'bg-white/35' },
    pending: { badge: 'bg-white/[0.035] text-sparkle-text-muted/65', dot: 'bg-white/35' },
    running: { badge: 'bg-cyan-400/[0.07] text-cyan-100/80', dot: 'bg-cyan-300', pulse: true },
    paused: { badge: 'bg-amber-400/[0.07] text-amber-100/75', dot: 'bg-amber-300' },
    completed: { badge: 'bg-emerald-400/[0.06] text-emerald-100/70', dot: 'bg-emerald-300/75' },
    cached: { badge: 'bg-violet-400/[0.065] text-violet-100/72', dot: 'bg-violet-300/75' },
    partial: { badge: 'bg-amber-400/[0.07] text-amber-100/75', dot: 'bg-amber-300' },
    failed: { badge: 'bg-rose-400/[0.08] text-rose-100/80', dot: 'bg-rose-300' },
    cancelled: { badge: 'bg-white/[0.025] text-sparkle-text-muted/55', dot: 'bg-white/25' },
    blocked: { badge: 'bg-orange-400/[0.07] text-orange-100/75', dot: 'bg-orange-300' },
    recovering: { badge: 'bg-violet-400/[0.07] text-violet-100/75', dot: 'bg-violet-300', pulse: true }
}

export function AssistantWorkflowStatusBadge({ status }: { status: WorkflowRunStatus | WorkflowNodeStatus }) {
    const style = STATUS_STYLES[status]
    return (
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[8px] font-semibold capitalize tracking-[0.02em]', style.badge)}>
            <span className={cn('size-1.5 rounded-full', style.dot, style.pulse && 'motion-safe:animate-pulse')} aria-hidden="true" />
            {status.replace('-', ' ')}
        </span>
    )
}

export function AssistantWorkflowActionButtons({
    run,
    onAction,
    className
}: {
    run: WorkflowRunState
    onAction?: (action: AssistantWorkflowAction, workflowRunId: string) => void
    className?: string
}) {
    const actions: Array<{ action: AssistantWorkflowAction; label: string; icon: ReactNode }> = []
    if (run.status === 'running') actions.push({ action: 'pause', label: 'Pause', icon: <Pause size={9} /> })
    if (run.status === 'paused') actions.push({ action: 'resume', label: 'Resume', icon: <Play size={9} /> })
    if (run.status === 'running' || run.status === 'paused') actions.push({ action: 'stop', label: 'Stop', icon: <Square size={9} /> })
    if (run.status === 'failed' || run.status === 'partial' || run.status === 'cancelled') actions.push({ action: 'restart', label: 'Restart', icon: <RotateCcw size={9} /> })
    if (run.status === 'completed') actions.push({ action: 'save', label: 'Save', icon: <Save size={9} /> })
    if (!actions.length) return null

    return (
        <nav className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label={`Actions for ${run.definitionName}`}>
            {actions.map(({ action, label, icon }) => (
                <button
                    key={action}
                    type="button"
                    onClick={() => onAction?.(action, run.workflowRunId)}
                    className="inline-flex h-6 items-center gap-1.5 rounded bg-white/[0.035] px-2 text-[8px] font-medium text-sparkle-text-muted transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                >
                    {icon}
                    {label}
                </button>
            ))}
        </nav>
    )
}
