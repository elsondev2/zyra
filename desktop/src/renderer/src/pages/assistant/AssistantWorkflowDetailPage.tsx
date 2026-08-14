import type { ReactNode } from 'react'
import { ArrowLeft, Gauge, Layers3, TriangleAlert, Users, Workflow } from 'lucide-react'
import type { AgentRunState, WorkflowCallState, WorkflowRunState } from '@shared/assistant/contracts'
import { formatAssistantAgentTokens, resolveAssistantAgentIdentity, shortAssistantAgentModel } from './assistant-agent-presentation'
import { AssistantAgentAvatar } from './AssistantAgentPrimitives'
import {
    formatAssistantWorkflowCost,
    formatAssistantWorkflowElapsed,
    formatAssistantWorkflowInput,
    getAssistantWorkflowProgress,
    humanizeWorkflowValue,
    resolveAssistantWorkflowIdentity
} from './assistant-workflow-presentation'
import {
    AssistantWorkflowActionButtons,
    AssistantWorkflowAvatar,
    AssistantWorkflowStatusBadge,
    type AssistantWorkflowAction
} from './AssistantWorkflowPrimitives'

export function AssistantWorkflowDetailPage({
    run,
    agents,
    onBack,
    onOpenAgent,
    onWorkflowAction
}: {
    run: WorkflowRunState
    agents: Record<string, AgentRunState>
    onBack: () => void
    onOpenAgent: (agentRunId: string) => void
    onWorkflowAction?: (action: AssistantWorkflowAction, workflowRunId: string) => void
}) {
    const identity = resolveAssistantWorkflowIdentity(run)
    const progress = getAssistantWorkflowProgress(run)
    const phases = Object.values(run.phases)
    const calls = Object.values(run.calls)
    const args = Object.entries(run.args)

    return (
        <section className="flex min-h-0 flex-1 flex-col" data-testid="assistant-workflow-detail-page" data-workflow-run-id={run.workflowRunId}>
            <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] px-2.5 py-2">
                <button type="button" onClick={onBack} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.05] hover:text-sparkle-text" aria-label="Back to workflow directory">
                    <ArrowLeft size={14} />
                </button>
                <AssistantWorkflowAvatar run={run} size={38} />
                <div className="min-w-28 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-[12px] font-semibold text-sparkle-text">{identity.name}</h2>
                        <AssistantWorkflowStatusBadge status={run.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[9px] font-medium capitalize text-[var(--accent-primary)]/70">{identity.avatarStyle} workflow · attempt {run.attempt}</p>
                </div>
                <AssistantWorkflowActionButtons run={run} onAction={onWorkflowAction} />
            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <div className="mx-auto w-full max-w-4xl px-3 py-3">
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(7.5rem, 1fr))' }}>
                        <SummaryMetric label="Progress" value={`${progress.percentage}%`} />
                        <SummaryMetric label="Phases" value={`${progress.completedPhases}/${progress.totalPhases || 0}`} />
                        <SummaryMetric label="Agents" value={String(run.agentRunIds.length)} />
                        <SummaryMetric label="Tokens" value={formatAssistantAgentTokens(run.usage.totalTokens)} />
                        <SummaryMetric label="Runtime" value={formatAssistantWorkflowElapsed(run)} />
                        <SummaryMetric label="Cost" value={formatAssistantWorkflowCost(run.usage.cost)} />
                    </div>

                    <section className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.012] p-3.5" aria-label="Workflow progress">
                        <SectionTitle icon={<Layers3 size={13} />} title="Phase progress" detail={`${progress.completedPhases} of ${progress.totalPhases || 0} complete`} />
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.035]">
                            <span className="block h-full rounded-full bg-[var(--accent-primary)]/65 transition-[width] duration-300" style={{ width: `${progress.percentage}%` }} />
                        </div>
                        {phases.length ? (
                            <div className="mt-3 divide-y divide-white/[0.04]">
                                {phases.map((phase, index) => (
                                    <div key={phase.phaseId} className="flex min-h-11 items-center gap-3 py-2 first:pt-0 last:pb-0">
                                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.025] text-[8px] font-semibold text-sparkle-text-muted/50">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[10px] font-medium text-sparkle-text-secondary/78">{humanizeWorkflowValue(phase.name)}</p>
                                            <p className="mt-0.5 text-[8px] text-sparkle-text-muted/42">{formatPhaseTiming(phase.startedAt, phase.completedAt)}</p>
                                        </div>
                                        <AssistantWorkflowStatusBadge status={phase.status} />
                                    </div>
                                ))}
                            </div>
                        ) : <EmptySection text="Phases will appear when this workflow starts." />}
                    </section>

                    <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                        <section className="rounded-lg border border-white/[0.05] bg-white/[0.012] p-3.5" aria-label="Workflow agents">
                            <SectionTitle icon={<Users size={13} />} title="Agent calls" detail={`${progress.completedCalls}/${progress.totalCalls || 0} complete`} />
                            {calls.length ? (
                                <div className="mt-3 divide-y divide-white/[0.04]">
                                    {calls.map((call) => (
                                        <WorkflowCallRow key={call.callId} call={call} agent={call.agentRunId ? agents[call.agentRunId] || null : null} onOpenAgent={onOpenAgent} />
                                    ))}
                                </div>
                            ) : <EmptySection text="No agents have been called yet." />}
                        </section>

                        <section className="rounded-lg border border-white/[0.05] bg-white/[0.012] p-3.5" aria-label="Workflow budget">
                            <SectionTitle icon={<Gauge size={13} />} title="Usage & budget" detail={`Concurrency ${run.budget.maxConcurrency}`} />
                            <div className="mt-3 space-y-3">
                                <BudgetMeter label="Calls" value={calls.length} maximum={run.budget.maxCalls} display={`${calls.length}/${run.budget.maxCalls}`} />
                                <BudgetMeter label="Requests" value={run.usage.requests || 0} maximum={run.budget.maxRequests} display={`${run.usage.requests || 0}/${run.budget.maxRequests}`} />
                                <BudgetMeter label="Tokens" value={run.usage.totalTokens || 0} maximum={run.budget.maxTokens} display={`${formatAssistantAgentTokens(run.usage.totalTokens)}/${formatAssistantAgentTokens(run.budget.maxTokens)}`} />
                                <BudgetMeter label="Cost" value={run.usage.cost || 0} maximum={run.budget.maxCostUsd} display={`${formatAssistantWorkflowCost(run.usage.cost)}/${formatAssistantWorkflowCost(run.budget.maxCostUsd)}`} />
                            </div>
                        </section>
                    </div>

                    {args.length ? (
                        <section className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.012] p-3.5" aria-label="Workflow inputs">
                            <SectionTitle icon={<Workflow size={13} />} title="Inputs" detail={`${args.length} configured`} />
                            <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                {args.map(([key, value]) => (
                                    <div key={key} className="border-t border-white/[0.04] py-2 first:border-t-0 sm:first:border-t">
                                        <span className="block text-[8px] font-semibold uppercase tracking-[0.08em] text-sparkle-text-muted/40">{humanizeWorkflowValue(key)}</span>
                                        <span className="mt-1 block text-[10px] leading-4 text-sparkle-text-secondary/70">{formatAssistantWorkflowInput(value)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <WorkflowOutcome run={run} />
                </div>
            </div>
        </section>
    )
}

function WorkflowCallRow({ call, agent, onOpenAgent }: { call: WorkflowCallState; agent: AgentRunState | null; onOpenAgent: (agentRunId: string) => void }) {
    const identity = agent ? resolveAssistantAgentIdentity(agent) : null
    const content = (
        <>
            {agent ? <AssistantAgentAvatar run={agent} size={28} /> : <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/[0.025]"><Users size={12} className="text-sparkle-text-muted/40" /></span>}
            <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium text-sparkle-text-secondary/78">{identity?.name || humanizeWorkflowValue(call.agentName || 'Agent call')}</p>
                <p className="mt-0.5 truncate text-[8px] text-sparkle-text-muted/45">{identity?.roleTitle || humanizeWorkflowValue(call.phaseId || 'Workflow agent')}{call.selectedModel ? ` · ${shortAssistantAgentModel(call.selectedModel)}` : ''}</p>
                {agent?.activity?.summary ? <p className="mt-0.5 truncate text-[8px] text-[var(--accent-primary)]/50">{agent.activity.summary}</p> : null}
            </div>
            {call.cached ? <span className="text-[8px] font-medium text-violet-200/55">Cached</span> : null}
            <AssistantWorkflowStatusBadge status={call.status} />
        </>
    )
    return agent ? (
        <button type="button" onClick={() => onOpenAgent(agent.agentRunId)} className="flex min-h-12 w-full items-center gap-2.5 py-2 text-left transition-colors hover:bg-white/[0.018]" aria-label={`Open ${identity?.name || 'workflow agent'}`}>
            {content}
        </button>
    ) : <div className="flex min-h-12 items-center gap-2.5 py-2">{content}</div>
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-lg border border-white/[0.045] bg-white/[0.016] px-2.5 py-2"><span className="block text-[8px] uppercase tracking-[0.08em] text-sparkle-text-muted/40">{label}</span><strong className="mt-1 block truncate text-[10px] font-medium text-sparkle-text-secondary/78">{value}</strong></div>
}

function SectionTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
    return <div className="flex items-center gap-2"><span className="text-[var(--accent-primary)]/65">{icon}</span><h3 className="text-[10px] font-semibold text-sparkle-text-secondary/80">{title}</h3><span className="ml-auto text-[8px] text-sparkle-text-muted/42">{detail}</span></div>
}

function BudgetMeter({ label, value, maximum, display }: { label: string; value: number; maximum: number; display: string }) {
    const percentage = maximum > 0 ? Math.min(100, Math.round((value / maximum) * 100)) : 0
    return <div><div className="flex items-center justify-between text-[8px]"><span className="text-sparkle-text-muted/48">{label}</span><span className="text-sparkle-text-secondary/65">{display}</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.035]"><span className="block h-full rounded-full bg-cyan-300/45" style={{ width: `${percentage}%` }} /></div></div>
}

function WorkflowOutcome({ run }: { run: WorkflowRunState }) {
    const result = run.result == null ? '' : formatAssistantWorkflowInput(run.result)
    const tone = run.error ? 'border-rose-300/25 text-rose-100/70' : run.status === 'completed' ? 'border-emerald-300/25 text-emerald-100/70' : 'border-white/10 text-sparkle-text-secondary/65'
    const title = run.error ? 'Workflow error' : run.status === 'completed' ? 'Workflow completed' : 'Current outcome'
    const text = run.error?.message || (result && result !== 'Empty' ? result : run.status === 'completed' ? 'The workflow completed without a written summary.' : 'The final outcome will appear when execution finishes.')
    return (
        <section className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.012] p-3.5" aria-label="Workflow outcome">
            <div className={`border-l-2 pl-3 ${tone}`}><h3 className="text-[10px] font-semibold">{title}</h3><p className="mt-1 whitespace-pre-wrap text-[10px] leading-5">{text}</p></div>
            {run.warnings.length ? <div className="mt-3 flex items-start gap-2 border-t border-white/[0.04] pt-3 text-[9px] leading-4 text-amber-100/60"><TriangleAlert size={11} className="mt-0.5 shrink-0" /><span>{run.warnings.join(' ')}</span></div> : null}
        </section>
    )
}

function EmptySection({ text }: { text: string }) {
    return <p className="mt-4 py-3 text-center text-[9px] leading-4 text-sparkle-text-muted/45">{text}</p>
}

function formatPhaseTiming(startedAt?: string | null, completedAt?: string | null): string {
    if (!startedAt) return 'Not started'
    const start = Date.parse(startedAt)
    const end = completedAt ? Date.parse(completedAt) : Date.now()
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Timing unavailable'
    const seconds = Math.max(0, Math.round((end - start) / 1000))
    return completedAt ? `Completed in ${seconds}s` : `Running for ${seconds}s`
}
