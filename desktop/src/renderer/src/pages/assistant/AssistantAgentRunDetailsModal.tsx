import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Clock3, Cpu, FolderOpen, ShieldCheck, Wrench, X } from 'lucide-react'
import type { AgentRunState } from '@shared/assistant/contracts'
import {
    formatAssistantAgentElapsed,
    formatAssistantAgentTokens,
    resolveAssistantAgentIdentity,
    shortAssistantAgentModel
} from './assistant-agent-presentation'
import { AssistantAgentAvatar, AssistantAgentStatusBadge } from './AssistantAgentPrimitives'

export function AssistantAgentRunDetailsModal({
    open,
    run,
    onClose
}: {
    open: boolean
    run: AgentRunState
    onClose: () => void
}) {
    const titleId = useId()
    const closeButtonRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        if (!open || typeof document === 'undefined') return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        closeButtonRef.current?.focus()
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [onClose, open])

    if (!open || typeof document === 'undefined') return null
    const identity = resolveAssistantAgentIdentity(run)
    const cleanResult = cleanAgentResult(run.result?.text)
    const origin = run.parentAgentRunId
        ? 'Delegated by another agent'
        : run.workflowRunId
            ? 'Started by a workflow'
            : 'Delegated from the root conversation'

    return createPortal((
        <div
            className="fixed inset-0 z-[2147482000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <section
                className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[color-mix(in_srgb,var(--color-bg)_97%,black)] text-sparkle-text shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-testid="assistant-agent-run-details-modal"
                onClick={(event) => event.stopPropagation()}
            >
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.055] bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] px-4">
                <AssistantAgentAvatar run={run} size={34} />
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 id={titleId} className="truncate text-[13px] font-semibold">{identity.name}</h2>
                        <AssistantAgentStatusBadge status={run.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[9px] text-sparkle-text-muted/60">Run details · {identity.roleTitle}</p>
                </div>
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.055] hover:text-sparkle-text"
                    aria-label="Close run details"
                >
                    <X size={15} />
                </button>
            </header>

            <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <div className="mx-auto w-full max-w-6xl px-5 py-5">
                    <section className="border-l-2 border-[var(--accent-primary)]/45 pl-4" aria-label="Delegated task">
                        <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--accent-primary)]/70">Delegated task</p>
                        <p className="mt-2 max-w-5xl whitespace-pre-wrap text-[13px] font-medium leading-6 text-sparkle-text/92">{run.goal || 'No delegated task was recorded.'}</p>
                        {run.activity?.summary ? <p className="mt-2 text-[10px] leading-5 text-sparkle-text-muted/60">Current activity: {run.activity.summary}</p> : null}
                    </section>

                    <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <OverviewMetric label="Status" value={humanize(run.status)} />
                        <OverviewMetric label="Model" value={shortAssistantAgentModel(run.selectedModel)} />
                        <OverviewMetric label="Effort" value={formatEffort(run.effort)} />
                        <OverviewMetric label="Runtime" value={formatAssistantAgentElapsed(run.elapsedMs)} />
                        <OverviewMetric label="Tokens" value={formatAssistantAgentTokens(run.usage.totalTokens)} />
                        <OverviewMetric label="Requests" value={String(run.usage.requests || 0)} />
                    </div>

                    <div className="mt-5 grid items-start gap-3 lg:grid-cols-2">
                        <DetailsSection icon={<Cpu size={14} />} title="Execution">
                            <CleanDetail label="Agent type" value={humanize(run.definitionName || run.agentId)} />
                            <CleanDetail label="Origin" value={origin} />
                            <CleanDetail label="Attempt" value={run.maxAttempts > 1 ? `${run.attempt} of ${run.maxAttempts}` : String(run.attempt)} />
                            <CleanDetail label="Model route" value={run.modelRoute?.fallback ? 'Fallback model used' : 'Requested model used'} />
                            <CleanDetail label="Estimated cost" value={formatAgentCost(run.usage.cost)} />
                        </DetailsSection>

                        <DetailsSection icon={<ShieldCheck size={14} />} title="Access">
                            <CleanDetail label="Permission" value={formatPermission(run.permissionMode)} />
                            <CleanDetail label="Isolation" value={formatIsolation(run.isolation)} />
                            <CleanDetail label="Read access" value={formatScope(run.readScope)} />
                            <CleanDetail label="Write access" value={formatScope(run.writeScope, 'No write access')} />
                            <CleanDetail label="Control" value={run.controlLease ? `${humanize(run.controlLease.state)} · ${run.controlLease.capabilities.map(humanize).join(', ') || 'No capabilities'}` : 'No delegated control'} />
                            <CleanDetail label="Workspace" value={run.worktree ? `Dedicated worktree${run.worktree.branch ? ` on ${run.worktree.branch}` : ''}` : 'Shared project workspace'} />
                        </DetailsSection>

                        <DetailsSection icon={<Wrench size={14} />} title="Tools">
                            <CleanList values={run.grantedTools.map(humanize)} empty="No tools were granted." />
                            {run.deniedTools.length > 0 ? (
                                <div className="mt-3 border-t border-white/[0.045] pt-3">
                                    <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-sparkle-text-muted/40">Unavailable</p>
                                    <p className="mt-1.5 text-[10px] leading-5 text-sparkle-text-muted/55">{run.deniedTools.map(humanize).join(', ')}</p>
                                </div>
                            ) : null}
                        </DetailsSection>

                        <DetailsSection icon={<Clock3 size={14} />} title="Timeline">
                            <CleanDetail label="Created" value={formatRunDateTime(run.createdAt)} />
                            <CleanDetail label="Started" value={run.startedAt ? formatRunDateTime(run.startedAt) : 'Not started'} />
                            <CleanDetail label="Completed" value={run.completedAt ? formatRunDateTime(run.completedAt) : 'In progress'} />
                            <CleanDetail label="Elapsed" value={formatAssistantAgentElapsed(run.elapsedMs)} />
                        </DetailsSection>
                    </div>

                    <DetailsSection icon={<Activity size={14} />} title="Outcome" className="mt-3">
                        {run.error ? (
                            <OutcomeMessage tone="error" title="Run ended with an error" text={run.error.message} />
                        ) : cleanResult ? (
                            <OutcomeMessage tone="success" title="Final result" text={cleanResult} />
                        ) : run.status === 'completed' ? (
                            <OutcomeMessage tone="warning" title="No final response" text="The run completed without a written assistant result. Its transcript may still contain the delegated task and recorded activity." />
                        ) : (
                            <OutcomeMessage tone="neutral" title="Run in progress" text="A final result will appear here when the agent writes one." />
                        )}
                        {run.result?.warnings?.length ? (
                            <div className="mt-3 border-t border-white/[0.045] pt-3 text-[10px] leading-5 text-amber-100/60">
                                {run.result.warnings.join(' ')}
                            </div>
                        ) : null}
                    </DetailsSection>
                </div>
            </main>
            </section>
        </div>
    ), document.body)
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-white/[0.045] bg-white/[0.016] px-3 py-2.5">
            <span className="block text-[8px] font-semibold uppercase tracking-[0.09em] text-sparkle-text-muted/40">{label}</span>
            <strong className="mt-1.5 block truncate text-[11px] font-medium text-sparkle-text-secondary/80">{value}</strong>
        </div>
    )
}

function DetailsSection({ icon, title, children, className = '' }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
    return (
        <section className={`rounded-lg border border-white/[0.05] bg-white/[0.012] p-4 ${className}`}>
            <h3 className="flex items-center gap-2 text-[10px] font-semibold text-sparkle-text-secondary/80">
                <span className="text-[var(--accent-primary)]/65">{icon}</span>
                {title}
            </h3>
            <div className="mt-3">{children}</div>
        </section>
    )
}

function CleanDetail({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-h-8 items-start justify-between gap-5 border-t border-white/[0.04] py-2 first:border-t-0 first:pt-0 last:pb-0">
            <span className="shrink-0 text-[9px] text-sparkle-text-muted/45">{label}</span>
            <span className="min-w-0 text-right text-[10px] leading-4 text-sparkle-text-secondary/72">{value}</span>
        </div>
    )
}

function CleanList({ values, empty }: { values: string[]; empty: string }) {
    if (!values.length) return <p className="text-[10px] leading-5 text-sparkle-text-muted/50">{empty}</p>
    return <p className="text-[10px] leading-5 text-sparkle-text-secondary/72">{values.join(', ')}</p>
}

function OutcomeMessage({ tone, title, text }: { tone: 'success' | 'warning' | 'error' | 'neutral'; title: string; text: string }) {
    const toneClass = tone === 'success'
        ? 'border-emerald-300/25 text-emerald-100/72'
        : tone === 'warning'
            ? 'border-amber-300/25 text-amber-100/72'
            : tone === 'error'
                ? 'border-rose-300/25 text-rose-100/72'
                : 'border-white/10 text-sparkle-text-secondary/65'
    return (
        <div className={`border-l-2 pl-3 ${toneClass}`}>
            <h4 className="text-[10px] font-semibold">{title}</h4>
            <p className="mt-1 whitespace-pre-wrap text-[10px] leading-5">{text}</p>
        </div>
    )
}

function cleanAgentResult(value: string | undefined): string | null {
    const text = String(value || '').trim()
    if (!text || /^\[Child result:[^\]]+\]$/.test(text)) return null
    return text
}

function formatEffort(value: string): string {
    if (value === 'xhigh') return 'Extra high'
    if (value === 'max') return 'Maximum'
    return humanize(value)
}

function formatPermission(value: string): string {
    if (value === 'read-only') return 'Read only'
    if (value === 'read-write') return 'Read and write'
    return humanize(value)
}

function formatIsolation(value: AgentRunState['isolation']): string {
    if (value === 'shared-read') return 'Shared, read only'
    if (value === 'serialized-write') return 'Shared, serialized writes'
    if (value === 'worktree') return 'Dedicated worktree'
    return 'Shared workspace'
}

function formatScope(values: string[], empty = 'No scoped access'): string {
    if (!values.length) return empty
    if (values.length === 1 && values[0] === '.') return 'Current project'
    return values.map((value) => {
        const normalized = value.replace(/\\/g, '/').replace(/\/$/, '')
        const parts = normalized.split('/').filter(Boolean)
        return parts.slice(-2).join('/') || value
    }).join(', ')
}

function formatAgentCost(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value <= 0) return 'No cost recorded'
    const fractionDigits = value < 0.01 ? 4 : 2
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value)
}

function formatRunDateTime(value: string): string {
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return 'Unavailable'
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}

function humanize(value: string): string {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.:/]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Unavailable'
}
