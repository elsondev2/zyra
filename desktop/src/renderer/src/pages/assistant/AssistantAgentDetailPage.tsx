import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, LoaderCircle, RefreshCcw, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import type { AgentRunState, AgentTranscriptPage } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { TimelineIssueList, TimelineMessage, TimelineWorkingIndicator } from './AssistantTimelineRows'
import { TimelineTurnWorkSummary } from './AssistantTimelineWorkSummary'
import { isIssueActivity, type TimelineDisplayRow } from './assistant-timeline-helpers'
import { projectAssistantAgentChat } from './assistant-agent-chat-model'
import { AssistantAgentActionButtons, AssistantAgentAvatar, type AssistantAgentAction } from './AssistantAgentPrimitives'
import { AssistantAgentRunDetailsModal } from './AssistantAgentRunDetailsModal'
import { TimelineToolCallList } from './AssistantTimelineToolCalls'
import './assistant-agent-chat.css'

export function AssistantAgentDetailPage({
    run, transcript, loading, error, onBack, onLoadOlder, onLoadNewer, onRetry, onAgentAction
}: {
    run: AgentRunState
    transcript: AgentTranscriptPage | null
    loading: boolean
    error: string | null
    onBack: () => void
    onLoadOlder: () => void
    onLoadNewer?: () => void
    onRetry: () => void
    onAgentAction?: (action: AssistantAgentAction, agentRunId: string) => void
}) {
    const [runDetailsOpen, setRunDetailsOpen] = useState(false)
    const { settings } = useSettings()
    const chat = useMemo(() => projectAssistantAgentChat(run, transcript), [run, transcript])
    const detailsRef = useRef<HTMLButtonElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const positionRef = useRef<{ runId: string; firstIndex: number | undefined; height: number; top: number; atBottom: boolean } | null>(null)
    const rememberPosition = () => {
        const node = scrollRef.current
        if (!node) return
        positionRef.current = { runId: run.agentRunId, firstIndex: transcript?.entries[0]?.index,
            height: node.scrollHeight, top: node.scrollTop,
            atBottom: node.scrollHeight - node.scrollTop - node.clientHeight < 64 }
    }
    useLayoutEffect(() => {
        const node = scrollRef.current
        if (!node) return
        const previous = positionRef.current
        const firstIndex = transcript?.entries[0]?.index
        if (!previous || previous.runId !== run.agentRunId || previous.firstIndex == null) {
            node.scrollTop = 0
        } else if (firstIndex != null && firstIndex < previous.firstIndex) {
            node.scrollTop = previous.top + node.scrollHeight - previous.height
        } else if (!chat.terminal && previous.atBottom) {
            node.scrollTop = node.scrollHeight
        }
        rememberPosition()
    }, [run.agentRunId, transcript, chat, loading])

    const renderRow = (row: TimelineDisplayRow, inWork = false): ReactNode => {
        if (row.kind === 'turn-work-summary') {
            const statusLabel = transcript?.nextAfter != null && !row.running && !row.completedAt ? 'Work' : row.running && run.status !== 'running'
                ? ({ queued: 'Queued', starting: 'Starting', waiting: 'Waiting', blocked: 'Blocked', recovering: 'Reconnecting' } as Record<string, string>)[run.status] || null
                : null
            return <TimelineTurnWorkSummary key={row.id} startedAt={row.startedAt} completedAt={row.completedAt}
                running={row.running} collapseForTerminalResponse={row.terminalResponseVisible} outcome={row.outcome}
                interruptionLabel={row.interruptionLabel} statusLabel={statusLabel} displayMode={settings.assistantChatDisplayMode}
                actionCount={row.rows.reduce((count, nested) => count + (nested.kind === 'activity' ? 1 : 'activities' in nested ? nested.activities.length : 0), 0)}
                hasWork={row.rows.length > 0} renderChildren={() => <div className="assistant-agent-chat__work" data-assistant-work-sequence="chronological">
                    {row.rows.map(nested => renderRow(nested, true))}
                </div>} />
        }
        if (row.kind === 'message') {
            if (row.workBoundaryOnly) return null
            return <article key={row.id} className={row.message.role === 'user' ? 'assistant-agent-chat__request' : undefined}
                data-agent-transcript-role={row.message.role} data-agent-result-fallback={row.id === chat.resultFallbackId || undefined}
                aria-label={row.id === chat.fallbackTaskId ? 'Delegated task' : undefined}>
                {row.message.role === 'user' ? <p className="assistant-agent-chat__sender">Sent by main agent</p> : null}
                <TimelineMessage message={row.message} displayMode={settings.assistantChatDisplayMode}
                    inlineWorkNarration={inWork && row.message.role === 'assistant'}
                    isLastAssistantInTurn={!inWork && row.message.role === 'assistant'} />
            </article>
        }
        if (row.kind === 'working') return <TimelineWorkingIndicator key={row.id}
            startedAt={run.status === 'running' ? run.startedAt : null}
            label={({ queued: 'Queued', starting: 'Starting…', waiting: 'Waiting…', blocked: 'Blocked', recovering: 'Reconnecting…' } as Record<string, string>)[run.status] || 'Working…'} />
        const activities = row.kind === 'activity' ? [row.activity] : 'activities' in row ? row.activities : []
        if (!activities.length) return null
        return <div key={row.id} className="assistant-agent-chat__activities">{activities.every(isIssueActivity)
            ? <TimelineIssueList activities={activities} />
            : <TimelineToolCallList activities={activities} projectRootPath={run.worktree?.directory || null}
                displayMode={settings.assistantChatDisplayMode} toolOutputDefaultMode={settings.assistantToolOutputDefaultMode} />}</div>
    }
    const missingFinal = run.status === 'completed' && transcript && transcript.nextBefore == null && transcript.nextAfter == null && !chat.hasAssistant && !loading && !error

    return <section className="assistant-agent-chat" data-testid="assistant-agent-detail-page" data-agent-run-id={run.agentRunId}>
        <header className="assistant-agent-chat__header">
            <button type="button" onClick={onBack} className="assistant-agent-chat__back" aria-label="Back to agent directory"><ChevronLeft size={18} /></button>
            <AssistantAgentAvatar run={run} size={26} />
            <h2 className="assistant-agent-chat__title" title={run.label || run.goal}>{run.label || 'Agent chat'}</h2>
            <AssistantAgentActionButtons run={run} onAction={onAgentAction} />
            <button ref={detailsRef} type="button" onClick={() => setRunDetailsOpen(value => !value)} className="assistant-agent-chat__details"
                aria-label="Open run details" aria-expanded={runDetailsOpen} aria-haspopup="dialog" title="Run details"><SlidersHorizontal size={13} /><span>Details</span></button>
        </header>
        <div ref={scrollRef} onScroll={rememberPosition} data-assistant-capsule-scroll="agent-detail" className="assistant-agent-chat__scroll custom-scrollbar">
            <section className="assistant-agent-chat__conversation" aria-label={`${run.label || 'Agent'} transcript`}>
                {transcript?.nextBefore != null ? <div className="assistant-agent-chat__older"><button type="button" onClick={onLoadOlder} disabled={loading}>
                    {loading ? <LoaderCircle size={12} className="animate-spin" /> : null}Load older messages
                </button></div> : null}
                {error ? <div className="assistant-agent-chat__error" role="alert"><TriangleAlert size={14} /><p>{error}</p>
                    <button type="button" onClick={onRetry}><RefreshCcw size={12} />Retry</button>
                </div> : null}
                <div className="assistant-agent-chat__messages" data-testid="assistant-agent-transcript" aria-readonly="true">{loading && !transcript && run.sessionFile ? null : chat.rows.map(row => renderRow(row))}</div>
                {transcript?.nextAfter != null && onLoadNewer ? <div className="assistant-agent-chat__older assistant-agent-chat__newer"><button type="button" onClick={onLoadNewer} disabled={loading}>
                    {loading ? <LoaderCircle size={12} className="animate-spin" /> : null}Load next messages
                </button></div> : null}
                {loading && !transcript ? <div className="assistant-agent-chat__empty" role="status"><LoaderCircle size={15} className="animate-spin" />Loading conversation…</div> : null}
                {missingFinal ? <div className="assistant-agent-chat__notice" data-agent-transcript-state="missing-final-response">No final response was written. This saved transcript ends without assistant answer text.</div> : null}
                {!loading && !error && !run.sessionFile && !chat.hasAssistant && run.status === 'completed' ? <div className="assistant-agent-chat__empty">No saved conversation for this run.</div> : null}
                {transcript && transcript.truncatedEntries > 0 ? <p className="assistant-agent-chat__notice">{transcript.truncatedEntries} oversized record{transcript.truncatedEntries === 1 ? ' was' : 's were'} omitted.</p> : null}
            </section>
        </div>
        <AssistantAgentRunDetailsModal open={runDetailsOpen} run={run} anchorRef={detailsRef} onClose={() => setRunDetailsOpen(false)} />
    </section>
}
