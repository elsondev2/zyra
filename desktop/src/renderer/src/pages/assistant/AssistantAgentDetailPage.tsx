import { useState } from 'react'
import { ArrowLeft, FileText, LoaderCircle, RefreshCcw, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import type { AgentRunState, AgentTranscriptPage } from '@shared/assistant/contracts'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import {
    formatAssistantAgentElapsed,
    formatAssistantAgentTokens,
    projectAssistantAgentLiveToolActivity,
    projectAssistantAgentTranscriptActivities,
    projectAssistantAgentTranscriptMessages,
    resolveAssistantAgentIdentity,
    shortAssistantAgentModel
} from './assistant-agent-presentation'
import {
    AssistantAgentActionButtons,
    AssistantAgentAvatar,
    AssistantAgentStatusBadge,
    type AssistantAgentAction
} from './AssistantAgentPrimitives'
import { AssistantAgentRunDetailsModal } from './AssistantAgentRunDetailsModal'
import { TimelineToolCallList } from './AssistantTimelineToolCalls'

export function AssistantAgentDetailPage({
    run,
    transcript,
    loading,
    error,
    onBack,
    onLoadOlder,
    onRetry,
    onAgentAction
}: {
    run: AgentRunState
    transcript: AgentTranscriptPage | null
    loading: boolean
    error: string | null
    onBack: () => void
    onLoadOlder: () => void
    onRetry: () => void
    onAgentAction?: (action: AssistantAgentAction, agentRunId: string) => void
}) {
    const [runDetailsOpen, setRunDetailsOpen] = useState(false)
    const identity = resolveAssistantAgentIdentity(run)
    const messages = transcript ? projectAssistantAgentTranscriptMessages(transcript.entries) : []
    const activities = transcript ? projectAssistantAgentTranscriptActivities(transcript.entries) : []
    const terminal = ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
    const active = ['queued', 'starting', 'running', 'waiting', 'blocked', 'recovering'].includes(run.status)
    const liveToolActivity = active
        ? projectAssistantAgentLiveToolActivity(run.activity, run.heartbeatAt || run.startedAt || run.createdAt)
        : null
    const displayedActivities = [...activities]
    if (liveToolActivity && !displayedActivities.some((activity) => activity.activity.id === liveToolActivity.id)) {
        displayedActivities.push({
            index: Number.MAX_SAFE_INTEGER,
            partIndex: 0,
            toolCallId: liveToolActivity.id,
            summary: liveToolActivity.summary,
            detail: liveToolActivity.detail || null,
            status: 'running',
            timestamp: liveToolActivity.createdAt,
            activity: liveToolActivity
        })
    }
    const activityGroups = displayedActivities.length > 0 ? [{
        kind: 'activity-group' as const,
        index: activities[0]?.index ?? Math.max(-1, ...messages.map((message) => message.index)) + 1,
        activities: displayedActivities
    }] : []
    const transcriptRows = [
        ...messages.map((message) => ({ kind: 'message' as const, index: message.index, message })),
        ...activityGroups
    ].sort((left, right) => left.index - right.index)
    const hasRootTranscriptMessage = messages.some((message) => message.role === 'user' && message.text.trim())
    const resultText = String(run.result?.text || '').trim()
    const hasRenderedResult = resultText.length > 0 && messages.some((message) => {
        if (message.role !== 'assistant') return false
        const text = message.text.trim()
        return text === resultText || text.includes(resultText) || resultText.includes(text)
    })
    const renderResultFallback = terminal && Boolean(resultText) && !hasRenderedResult
    const hasAssistantMessage = messages.some((message) => message.role === 'assistant') || renderResultFallback
    const finishedWithoutFinalResponse = Boolean(run.sessionFile && terminal && !hasAssistantMessage)

    return (
        <section className="flex min-h-0 flex-1 flex-col" data-testid="assistant-agent-detail-page" data-agent-run-id={run.agentRunId}>
            <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] px-2.5 py-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                    aria-label="Back to agent directory"
                >
                    <ArrowLeft size={14} />
                </button>
                <AssistantAgentAvatar run={run} size={36} />
                <div className="min-w-28 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-[12px] font-semibold text-sparkle-text">{identity.name}</h2>
                        <AssistantAgentStatusBadge status={run.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[9px] font-medium text-[var(--accent-primary)]/75">{identity.roleTitle}</p>
                </div>
                <AssistantAgentActionButtons run={run} onAction={onAgentAction} />
                <button
                    type="button"
                    onClick={() => setRunDetailsOpen(true)}
                    className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 text-[9px] font-medium text-sparkle-text-muted transition-colors hover:bg-white/[0.065] hover:text-sparkle-text"
                    aria-label={`Open run details for ${identity.name}`}
                >
                    <SlidersHorizontal size={11} />
                    Run details
                </button>
            </header>

            <div data-assistant-capsule-scroll="agent-detail" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <div className="mx-auto w-full max-w-3xl px-3 py-3">
                    {!hasRootTranscriptMessage ? (
                        <section className="rounded-xl border border-white/[0.065] bg-[color-mix(in_srgb,var(--color-card)_38%,transparent)] p-3" aria-label="Delegated task">
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-mono text-[8px] uppercase tracking-[0.11em] text-sparkle-text-muted/45">Delegated task</span>
                                <span className="truncate font-mono text-[8px] text-sparkle-text-muted/40">{run.definitionName || run.agentId}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-[11px] font-medium leading-5 text-sparkle-text/90">{run.goal || 'No delegated goal recorded.'}</p>
                            {run.activity?.summary ? (
                                <p className="mt-2 border-l border-[var(--accent-primary)]/30 pl-2 text-[9px] leading-4 text-sparkle-text-muted/65">{run.activity.summary}</p>
                            ) : null}
                        </section>
                    ) : null}

                    <div className={hasRootTranscriptMessage ? 'grid gap-2' : 'mt-2 grid gap-2'} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(7.5rem, 1fr))' }}>
                        <AgentFact label="Model" value={shortAssistantAgentModel(run.selectedModel)} title={run.selectedModel} />
                        <AgentFact label="Effort" value={run.effort} />
                        <AgentFact label="Tokens" value={formatAssistantAgentTokens(run.usage.totalTokens)} />
                        <AgentFact label="Runtime" value={formatAssistantAgentElapsed(run.elapsedMs)} />
                    </div>

                    <section className="mt-4" aria-label={`${identity.name} transcript`}>
                        <header className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                            <div className="flex items-center gap-2">
                                <FileText size={12} className="text-[var(--accent-primary)]/70" />
                                <div>
                                    <h3 className="text-[10px] font-semibold text-sparkle-text">Transcript</h3>
                                    <p className="mt-0.5 font-mono text-[8px] text-sparkle-text-muted/45">
                                        {transcript ? `${messages.length} messages · ${activities.length} activities · ${transcript.hydrated}/${transcript.totalEntries} records loaded` : 'Read-only child session'}
                                    </p>
                                </div>
                            </div>
                            {transcript?.nextBefore != null ? (
                                <button
                                    type="button"
                                    onClick={onLoadOlder}
                                    disabled={loading}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 text-[8px] font-medium text-sparkle-text-muted transition-colors hover:bg-white/[0.05] hover:text-sparkle-text disabled:cursor-wait disabled:opacity-45"
                                >
                                    {loading ? <LoaderCircle size={10} className="animate-spin" /> : null}
                                    Load older
                                </button>
                            ) : null}
                        </header>

                        {error ? (
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-300/10 bg-rose-400/[0.045] px-3 py-2.5" role="alert">
                                <TriangleAlert size={12} className="mt-0.5 shrink-0 text-rose-200/65" />
                                <p className="min-w-0 flex-1 text-[9px] leading-4 text-rose-100/65">{error}</p>
                                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-[8px] font-medium text-rose-100/75 hover:text-rose-100">
                                    <RefreshCcw size={9} /> Retry
                                </button>
                            </div>
                        ) : null}

                        {loading && !transcript ? (
                            <div className="flex min-h-32 items-center justify-center gap-2 text-[9px] text-sparkle-text-muted/55" role="status">
                                <LoaderCircle size={13} className="animate-spin text-[var(--accent-primary)]/70" />
                                Loading transcript…
                            </div>
                        ) : !run.sessionFile ? (
                            <TranscriptEmpty text="Transcript becomes available after the child session starts." />
                        ) : transcriptRows.length === 0 && !finishedWithoutFinalResponse && !renderResultFallback && !liveToolActivity ? (
                            <TranscriptEmpty text="Activity appears here when the child session starts working." />
                        ) : (
                            <div className="space-y-5 py-4" data-testid="assistant-agent-transcript" aria-readonly="true">
                                {transcriptRows.map((row) => row.kind === 'message'
                                    ? row.message.role === 'user'
                                        ? <RootTranscriptMessage key={`message:${row.message.index}:${row.message.role}`} message={row.message} runId={run.agentRunId} />
                                        : <AgentTranscriptMessage key={`message:${row.message.index}:${row.message.role}`} message={row.message} run={run} />
                                    : <TimelineToolCallList
                                        key={`activity-group:${row.index}`}
                                        activities={row.activities.map((activity) => activity.activity)}
                                        projectRootPath={run.worktree?.directory || null}
                                    />
                                )}
                                {renderResultFallback ? <AgentResultMessage text={resultText} run={run} /> : null}
                                {finishedWithoutFinalResponse ? <MissingFinalResponse run={run} /> : null}
                            </div>
                        )}

                        {transcript && transcript.truncatedEntries > 0 ? (
                            <p className="border-t border-white/[0.05] py-2 text-[8px] leading-4 text-amber-100/45">{transcript.truncatedEntries} oversized transcript record{transcript.truncatedEntries === 1 ? ' was' : 's were'} omitted by the bounded reader.</p>
                        ) : null}
                    </section>
                </div>
            </div>
            <AssistantAgentRunDetailsModal open={runDetailsOpen} run={run} onClose={() => setRunDetailsOpen(false)} />
        </section>
    )
}

function RootTranscriptMessage({ message, runId }: { message: ReturnType<typeof projectAssistantAgentTranscriptMessages>[number]; runId: string }) {
    return (
        <article className="ml-auto flex max-w-[92%] flex-col items-end" data-agent-transcript-role="user">
            <span className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-sparkle-text-muted/45">Root</span>
            <div className="rounded-[1rem] border border-white/[0.09] bg-white/[0.035] px-3 py-2.5">
                <MarkdownRenderer
                    content={message.text}
                    cacheKey={`agent-transcript:${runId}:${message.index}:user`}
                    lightweight
                    className="text-[11px] leading-5 text-sparkle-text-secondary/85 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-[12px] [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[12px] [&_h3]:text-[11px] [&_li]:leading-5 [&_p]:mb-2 [&_p]:leading-5 [&_p:last-child]:mb-0 [&_pre]:text-[9px] [&_code]:text-[9px]"
                />
            </div>
            {message.timestamp ? <time className="mt-1 px-1 text-[8px] text-sparkle-text-muted/35" dateTime={message.timestamp}>{formatTranscriptTime(message.timestamp)}</time> : null}
        </article>
    )
}

function AgentTranscriptMessage({ message, run }: { message: ReturnType<typeof projectAssistantAgentTranscriptMessages>[number]; run: AgentRunState }) {
    const identity = resolveAssistantAgentIdentity(run)
    return (
        <article className="flex max-w-full items-start gap-2.5" data-agent-transcript-role="assistant">
            <AssistantAgentAvatar run={run} size={24} className="mt-0.5" />
            <div className="min-w-0 max-w-[calc(100%-2.25rem)] flex-1">
                <span className="mb-1 block text-[8px] font-semibold text-[var(--accent-primary)]/65">{identity.name}</span>
                <MarkdownRenderer
                    content={message.text}
                    cacheKey={`agent-transcript:${run.agentRunId}:${message.index}:assistant`}
                    className="text-[12px] leading-5 text-sparkle-text/90 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-[13px] [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:leading-5 [&_p]:mb-2.5 [&_p]:leading-5 [&_p:last-child]:mb-0 [&_pre]:text-[10px] [&_code]:text-[10px]"
                />
                {message.timestamp ? <time className="mt-1 block text-[8px] text-sparkle-text-muted/35" dateTime={message.timestamp}>{formatTranscriptTime(message.timestamp)}</time> : null}
            </div>
        </article>
    )
}

function AgentResultMessage({ text, run }: { text: string; run: AgentRunState }) {
    const identity = resolveAssistantAgentIdentity(run)
    return (
        <article className="flex max-w-full items-start gap-2.5" data-agent-transcript-role="assistant" data-agent-result-fallback="true">
            <AssistantAgentAvatar run={run} size={24} className="mt-0.5" />
            <div className="min-w-0 max-w-[calc(100%-2.25rem)] flex-1">
                <span className="mb-1 block text-[8px] font-semibold text-[var(--accent-primary)]/65">{identity.name}</span>
                <MarkdownRenderer
                    content={text}
                    cacheKey={`agent-result:${run.agentRunId}:${run.completedAt || 'completed'}`}
                    className="text-[12px] leading-5 text-sparkle-text/90 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-[13px] [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:leading-5 [&_p]:mb-2.5 [&_p]:leading-5 [&_p:last-child]:mb-0 [&_pre]:text-[10px] [&_code]:text-[10px]"
                />
                {run.completedAt ? <time className="mt-1 block text-[8px] text-sparkle-text-muted/35" dateTime={run.completedAt}>{formatTranscriptTime(run.completedAt)}</time> : null}
            </div>
        </article>
    )
}

function MissingFinalResponse({ run }: { run: AgentRunState }) {
    const identity = resolveAssistantAgentIdentity(run)
    return (
        <article className="flex max-w-full items-start gap-2.5" data-agent-transcript-state="missing-final-response">
            <AssistantAgentAvatar run={run} size={24} className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <span className="mb-1 block text-[8px] font-semibold text-[var(--accent-primary)]/65">{identity.name}</span>
                <div className="rounded-md bg-amber-400/[0.055] px-3 py-2.5 text-[9px] leading-4 text-amber-100/65">
                    No final response was written for this run. Its saved transcript ends without assistant answer text, so there is nothing further to render as chat.
                </div>
            </div>
        </article>
    )
}

function AgentFact({ label, value, title }: { label: string; value: string; title?: string }) {
    return <div className="min-w-0 rounded-lg border border-white/[0.055] bg-white/[0.018] px-2.5 py-2"><span className="block text-[8px] uppercase tracking-[0.08em] text-sparkle-text-muted/40">{label}</span><strong className="mt-1 block truncate text-[9px] font-medium capitalize text-sparkle-text-secondary/75" title={title}>{value}</strong></div>
}

function TranscriptEmpty({ text }: { text: string }) {
    return <div className="flex min-h-32 items-center justify-center px-5 text-center text-[9px] leading-4 text-sparkle-text-muted/50">{text}</div>
}

function formatTranscriptTime(value: string): string {
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return value
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}
