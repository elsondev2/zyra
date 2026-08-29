import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Workflow } from 'lucide-react'
import type { WorkflowRunState } from '@shared/assistant/contracts'
import { formatAssistantAgentTokens } from './assistant-agent-presentation'
import {
    formatAssistantWorkflowCost,
    formatAssistantWorkflowElapsed,
    getAssistantWorkflowProgress,
    resolveAssistantWorkflowIdentity
} from './assistant-workflow-presentation'
import {
    AssistantWorkflowActionButtons,
    AssistantWorkflowAvatar,
    AssistantWorkflowStatusBadge,
    type AssistantWorkflowAction
} from './AssistantWorkflowPrimitives'

export const ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE = 9

const WORKFLOW_GRID_STYLE: CSSProperties = {
    gridTemplateColumns: 'repeat(auto-fit, minmax(0, 18rem))'
}

export function AssistantWorkflowDirectory({
    workflows,
    page,
    onPageChange,
    onOpenWorkflow,
    onWorkflowAction
}: {
    workflows: WorkflowRunState[]
    page: number
    onPageChange: (page: number) => void
    onOpenWorkflow: (workflowRunId: string) => void
    onWorkflowAction?: (action: AssistantWorkflowAction, workflowRunId: string) => void
}) {
    const pageCount = Math.max(1, Math.ceil(workflows.length / ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE))
    const safePage = Math.min(Math.max(0, page), pageCount - 1)
    const pageStart = safePage * ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE
    const visibleWorkflows = workflows.slice(pageStart, pageStart + ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE)
    const activeCount = workflows.filter((run) => ['queued', 'running', 'paused', 'recovering'].includes(run.status)).length
    const completedCount = workflows.filter((run) => run.status === 'completed').length

    useEffect(() => {
        if (safePage !== page) onPageChange(safePage)
    }, [onPageChange, page, safePage])

    return (
        <section className="flex min-h-0 flex-1 flex-col" data-testid="assistant-workflow-directory">
            <div data-assistant-capsule-scroll="workflows-directory" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
                <div className="mx-auto w-full max-w-[56rem]">
                    <header className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.04] pb-3">
                        <div>
                            <h2 className="text-[14px] font-semibold text-sparkle-text">Workflow runs</h2>
                            <p className="mt-0.5 text-[9px] leading-4 text-sparkle-text-muted/60">Track coordinated phases, delegated agents, budgets, and outcomes.</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[8px] font-medium text-sparkle-text-muted/55">
                            <span className="rounded bg-white/[0.025] px-2 py-1">{activeCount} active</span>
                            <span className="rounded bg-white/[0.025] px-2 py-1">{completedCount} done</span>
                        </div>
                    </header>

                    {workflows.length === 0 ? (
                        <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] bg-white/[0.012] px-5 text-center">
                            <Workflow size={20} className="text-sparkle-text-muted/35" />
                            <p className="text-[10px] font-medium text-sparkle-text-secondary/70">No workflow runs in this thread.</p>
                            <p className="max-w-xs text-[9px] leading-4 text-sparkle-text-muted/50">Saved workflow runs appear here with their phase and agent progress.</p>
                        </div>
                    ) : (
                        <div className="grid w-full items-start gap-2.5" style={WORKFLOW_GRID_STYLE} data-testid="assistant-workflow-card-grid">
                            {visibleWorkflows.map((run) => (
                                <AssistantWorkflowCard
                                    key={run.workflowRunId}
                                    run={run}
                                    onOpen={() => onOpenWorkflow(run.workflowRunId)}
                                    onWorkflowAction={onWorkflowAction}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {workflows.length > 0 ? (
                <footer className="shrink-0 border-t border-white/[0.04] bg-[color-mix(in_srgb,var(--color-bg)_97%,black)] px-3" data-testid="assistant-workflow-directory-footer">
                    <div className="mx-auto flex h-10 w-full max-w-[56rem] items-center justify-between gap-3 text-[9px] text-sparkle-text-muted/55">
                        <span>{pageStart + 1}–{Math.min(pageStart + ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE, workflows.length)} of {workflows.length} workflows</span>
                        {pageCount > 1 ? (
                            <nav className="flex items-center gap-1" aria-label="Workflow directory pages">
                                <PageButton label="Previous workflow page" disabled={safePage === 0} onClick={() => onPageChange(safePage - 1)} icon={<ChevronLeft size={12} />} />
                                <span className="min-w-16 text-center font-medium text-sparkle-text-muted/65">Page {safePage + 1} of {pageCount}</span>
                                <PageButton label="Next workflow page" disabled={safePage >= pageCount - 1} onClick={() => onPageChange(safePage + 1)} icon={<ChevronRight size={12} />} />
                            </nav>
                        ) : null}
                    </div>
                </footer>
            ) : null}
        </section>
    )
}

function AssistantWorkflowCard({
    run,
    onOpen,
    onWorkflowAction
}: {
    run: WorkflowRunState
    onOpen: () => void
    onWorkflowAction?: (action: AssistantWorkflowAction, workflowRunId: string) => void
}) {
    const identity = resolveAssistantWorkflowIdentity(run)
    const progress = getAssistantWorkflowProgress(run)
    const phaseNames = Object.values(run.phases).map((phase) => phase.name)
    return (
        <article className="group/card flex h-[13.25rem] w-full max-w-[18rem] min-w-0 justify-self-start flex-col overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_38%,transparent)] transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-card)_52%,transparent)]" data-testid="assistant-workflow-card" data-workflow-run-id={run.workflowRunId}>
            <button type="button" onClick={onOpen} className="flex min-h-0 flex-1 flex-col p-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]/45" aria-label={`Open ${identity.name} workflow`}>
                <div className="flex min-w-0 items-start gap-2.5">
                    <AssistantWorkflowAvatar run={run} size={42} />
                    <div className="min-w-0 flex-1 pt-0.5">
                        <strong className="block truncate text-[12px] font-semibold text-sparkle-text">{identity.name}</strong>
                        <span className="mt-0.5 block text-[8px] font-medium capitalize text-[var(--accent-primary)]/65">{identity.avatarStyle} workflow</span>
                    </div>
                    <AssistantWorkflowStatusBadge status={run.status} />
                </div>

                <p className="mt-3 line-clamp-2 min-h-8 text-[9px] leading-4 text-sparkle-text-secondary/65">
                    {phaseNames.length ? phaseNames.join(' → ') : 'Workflow phases will appear when execution begins.'}
                </p>

                <div className="mt-3">
                    <div className="flex items-center justify-between text-[8px] text-sparkle-text-muted/50">
                        <span>{progress.completedPhases}/{progress.totalPhases || 0} phases</span>
                        <span>{progress.percentage}%</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.035]">
                        <span className="block h-full rounded-full bg-[var(--accent-primary)]/65 transition-[width] duration-300" style={{ width: `${progress.percentage}%` }} />
                    </div>
                </div>

                <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                    <div className="min-w-0 text-[7.5px] font-medium">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-cyan-200/65">{run.agentRunIds.length} agents</span>
                            <span className="size-1 rounded-full bg-white/[0.12]" />
                            <span className="text-emerald-200/65">{formatAssistantAgentTokens(run.usage.totalTokens)} tokens</span>
                            <span className="size-1 rounded-full bg-white/[0.12]" />
                            <span className="text-amber-200/65">{formatAssistantWorkflowElapsed(run)}</span>
                        </div>
                        <span className="mt-1 block text-violet-200/55">{run.cacheHits} cached · {formatAssistantWorkflowCost(run.usage.cost)}</span>
                    </div>
                    <ArrowUpRight size={12} className="mb-0.5 shrink-0 text-sparkle-text-muted/25 transition-colors group-hover/card:text-[var(--accent-primary)]/70" />
                </div>
            </button>
            <AssistantWorkflowActionButtons run={run} onAction={onWorkflowAction} className="min-h-9 shrink-0 border-t border-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] px-3 py-1.5" />
        </article>
    )
}

function PageButton({ label, disabled, onClick, icon }: { label: string; disabled: boolean; onClick: () => void; icon: ReactNode }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="inline-flex size-7 items-center justify-center rounded bg-white/[0.025] text-sparkle-text-muted transition-colors hover:bg-white/[0.065] hover:text-sparkle-text disabled:cursor-default disabled:opacity-25">
            {icon}
        </button>
    )
}
