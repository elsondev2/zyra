import { memo, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, PanelRightClose, PanelRight } from 'lucide-react'
import type { AssistantActivePlan, AssistantLatestTurn, AssistantProposedPlan } from '@shared/assistant/contracts'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { formatAssistantDateTime } from '@/lib/assistant/selectors'
import { cn } from '@/lib/utils'
import { getDisplayedProposedPlanMarkdown, getProposedPlanTitle } from './assistant-proposed-plan'
import { getAssistantActivePlanProgress } from './assistant-plan-utils'

function stepStatusIcon(status: 'pending' | 'inProgress' | 'completed', executionState: 'idle' | 'running' | 'stopped' | 'completed') {
    if (status === 'completed') {
        return (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check size={12} />
            </span>
        )
    }
    if (status === 'inProgress') {
        if (executionState === 'stopped') {
            return (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                    <AlertTriangle size={12} />
                </span>
            )
        }
        return (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
                <Loader2 size={12} className="animate-spin" />
            </span>
        )
    }
    return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <span className="size-1.5 rounded-full bg-white/25" />
        </span>
    )
}

function planExecutionBadge(executionState: 'idle' | 'running' | 'stopped' | 'completed') {
    if (executionState === 'running') {
        return (
            <span className="rounded-full border border-blue-400/20 bg-blue-500/[0.10] px-2 py-0.5 text-[10px] font-medium text-blue-200">
                Running
            </span>
        )
    }
    if (executionState === 'stopped') {
        return (
            <span className="rounded-full border border-amber-400/20 bg-amber-500/[0.10] px-2 py-0.5 text-[10px] font-medium text-amber-200">
                Stopped
            </span>
        )
    }
    if (executionState === 'completed') {
        return (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.10] px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                Done
            </span>
        )
    }
    return null
}

export const AssistantPlanPanel = memo(function AssistantPlanPanel(props: {
    open: boolean
    compact?: boolean
    activePlan: AssistantActivePlan | null
    latestTurn: AssistantLatestTurn | null
    latestProposedPlan: AssistantProposedPlan | null
    markdownFilePath?: string | null
    onClose: () => void
    onShowThreadDetails: () => void
    onOpenInternalLink?: (href: string) => Promise<void> | void
}) {
    const { open, compact = false, activePlan, latestTurn, latestProposedPlan, markdownFilePath, onClose, onShowThreadDetails, onOpenInternalLink } = props
    const [proposedPlanExpanded, setProposedPlanExpanded] = useState(false)
    const progress = getAssistantActivePlanProgress(activePlan, latestTurn)
    const planMarkdown = latestProposedPlan?.planMarkdown ?? null
    const displayedPlanMarkdown = useMemo(() => planMarkdown ? getDisplayedProposedPlanMarkdown(planMarkdown) : '', [planMarkdown])
    const planTitle = useMemo(() => planMarkdown ? getProposedPlanTitle(planMarkdown) : null, [planMarkdown])
    const headerTimestamp = activePlan?.updatedAt || latestProposedPlan?.updatedAt || null

    return (
        <div
            className={cn('relative overflow-hidden transition-all duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
            style={{ width: open ? (compact ? '360px' : '460px') : '0px' }}
        >
            <aside className="flex h-full min-h-0 flex-col border-l border-white/10 bg-sparkle-card/50">
                <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-white/10 px-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded-md bg-blue-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                            Plan
                        </span>
                        {headerTimestamp ? (
                            <span className="truncate text-[11px] text-sparkle-text-muted/70">
                                {formatAssistantDateTime(headerTimestamp)}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={onShowThreadDetails}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.03] px-2 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                            title="Switch to thread details"
                            aria-label="Switch to thread details"
                        >
                            <PanelRight size={13} />
                            <span>Thread details</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md p-1 text-sparkle-text-muted/70 transition-colors hover:text-sparkle-text-secondary"
                            title="Close plan sidebar"
                            aria-label="Close plan sidebar"
                        >
                            <PanelRightClose size={14} />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-4 p-3">
                        {activePlan?.explanation ? (
                            <p className="text-[13px] leading-relaxed text-sparkle-text-secondary/85">
                                {activePlan.explanation}
                            </p>
                        ) : null}

                        {progress ? (
                            <div className="space-y-1">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sparkle-text-muted/55">
                                        Steps
                                    </p>
                                    {planExecutionBadge(progress.executionState)}
                                </div>
                                {progress.steps.map((step) => (
                                    <div
                                        key={`${step.status}:${step.step}`}
                                        className={cn(
                                            'flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200',
                                            step.status === 'inProgress' && progress.executionState === 'stopped' && 'bg-amber-500/[0.06]',
                                            step.status === 'inProgress' && progress.executionState !== 'stopped' && 'bg-blue-500/[0.05]',
                                            step.status === 'completed' && 'bg-emerald-500/[0.05]'
                                        )}
                                    >
                                        <div className="mt-0.5">{stepStatusIcon(step.status, progress.executionState)}</div>
                                        <p
                                            className={cn(
                                                'text-[13px] leading-snug',
                                                step.status === 'completed'
                                                    ? 'text-sparkle-text-muted/60 line-through decoration-sparkle-text-muted/20'
                                                    : step.status === 'inProgress' && progress.executionState === 'stopped'
                                                        ? 'text-amber-100/85'
                                                    : step.status === 'inProgress'
                                                        ? 'text-sparkle-text/90'
                                                        : 'text-sparkle-text-secondary/80'
                                            )}
                                        >
                                            {step.step}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {planMarkdown ? (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    className="group flex w-full items-center gap-1.5 text-left"
                                    onClick={() => setProposedPlanExpanded((value) => !value)}
                                >
                                    {proposedPlanExpanded ? (
                                        <ChevronDown size={12} className="shrink-0 text-sparkle-text-muted/55 transition-transform" />
                                    ) : (
                                        <ChevronRight size={12} className="shrink-0 text-sparkle-text-muted/55 transition-transform" />
                                    )}
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sparkle-text-muted/55 transition-colors group-hover:text-sparkle-text-muted/75">
                                        {planTitle ?? 'Full Plan'}
                                    </span>
                                </button>
                                <AnimatedHeight isOpen={proposedPlanExpanded} duration={240}>
                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                        <MarkdownRenderer
                                            content={displayedPlanMarkdown || ''}
                                            filePath={markdownFilePath || undefined}
                                            onInternalLinkClick={onOpenInternalLink}
                                            className="text-[13px] leading-6 text-sparkle-text [&_p]:mb-3 [&_p]:leading-6 [&_li]:leading-6 [&_ul]:text-[13px] [&_ol]:text-[13px] [&_pre]:text-[12px] [&_code]:text-[12px]"
                                        />
                                    </div>
                                </AnimatedHeight>
                            </div>
                        ) : null}

                        {!progress && !planMarkdown ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <p className="text-[13px] text-sparkle-text-secondary/60">No active plan yet.</p>
                                <p className="mt-1 text-[11px] text-sparkle-text-muted/45">
                                    Plans will appear here when generated.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            </aside>
        </div>
    )
})
