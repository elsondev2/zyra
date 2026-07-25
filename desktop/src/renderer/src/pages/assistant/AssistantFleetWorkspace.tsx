import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bot, GitBranch, LoaderCircle, Network, RotateCcw, Square, Workflow } from 'lucide-react'
import type { AgentRunState, AgentTranscriptPage, FleetSnapshot, WorkflowRunState } from '../../../../shared/assistant/contracts'
import { cn } from '@/lib/utils'

interface AssistantFleetWorkspaceProps {
    threadId: string | null
    snapshot: FleetSnapshot | null
    selectedAgentRunId: string | null
    selectedWorkflowRunId: string | null
    onSelectAgent: (agentRunId: string) => void
    onSelectWorkflow: (workflowRunId: string) => void
    onAgentAction?: (action: 'stop' | 'retry' | 'resume', agentRunId: string) => void
    onWorkflowAction?: (action: 'pause' | 'resume' | 'stop' | 'restart' | 'save', workflowRunId: string) => void
}

export function AssistantFleetWorkspace(props: AssistantFleetWorkspaceProps) {
    const [tab, setTab] = useState<'agents' | 'workflows'>('agents')
    const [transcript, setTranscript] = useState<AgentTranscriptPage | null>(null)
    const [transcriptLoading, setTranscriptLoading] = useState(false)
    const agents = useMemo(() => Object.values(props.snapshot?.agents ?? {}).sort(newestFirst), [props.snapshot])
    const workflows = useMemo(() => Object.values(props.snapshot?.workflows ?? {}).sort(newestFirst), [props.snapshot])
    const selectedAgent = agents.find((run) => run.agentRunId === props.selectedAgentRunId) ?? null
    const selectedWorkflow = workflows.find((run) => run.workflowRunId === props.selectedWorkflowRunId) ?? null

    useEffect(() => {
        if (!props.threadId || !selectedAgent?.sessionFile) { setTranscript(null); return }
        let cancelled = false
        setTranscriptLoading(true)
        void window.devscope.assistant.agentAction({
            threadId: props.threadId,
            action: 'transcript',
            payload: { agentRunId: selectedAgent.agentRunId, limit: 30 }
        }).then((response) => {
            if (!cancelled && response.success) setTranscript((response.result['page'] || response.result) as unknown as AgentTranscriptPage)
        }).finally(() => { if (!cancelled) setTranscriptLoading(false) })
        return () => { cancelled = true }
    }, [props.threadId, selectedAgent?.agentRunId, selectedAgent?.sessionFile])

    const loadOlderTranscript = async () => {
        if (!props.threadId || !selectedAgent || transcript?.nextBefore == null) return
        setTranscriptLoading(true)
        try {
            const response = await window.devscope.assistant.agentAction({ threadId: props.threadId, action: 'transcript', payload: { agentRunId: selectedAgent.agentRunId, limit: 30, before: transcript.nextBefore } })
            if (!response.success) return
            const page = (response.result['page'] || response.result) as unknown as AgentTranscriptPage
            setTranscript((current) => current ? { ...page, entries: [...page.entries, ...current.entries], hydrated: page.entries.length + current.entries.length } : page)
        } finally { setTranscriptLoading(false) }
    }

    return (
        <section className="flex min-h-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]" data-testid="assistant-fleet-workspace">
            <header className="flex h-9 shrink-0 items-end gap-1 border-b border-white/[0.06] px-2">
                <TabButton active={tab === 'agents'} onClick={() => setTab('agents')} icon={<Bot size={12} />} label="Agents" count={agents.length} />
                <TabButton active={tab === 'workflows'} onClick={() => setTab('workflows')} icon={<Workflow size={12} />} label="Workflows" count={workflows.length} />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {tab === 'agents'
                    ? <AgentRows agents={agents} {...props} />
                    : <WorkflowRows workflows={workflows} {...props} />}
                {tab === 'agents' && selectedAgent ? <AgentDetail run={selectedAgent} transcript={transcript} loading={transcriptLoading} onLoadOlder={() => void loadOlderTranscript()} /> : null}
                {tab === 'workflows' && selectedWorkflow ? <WorkflowDetail run={selectedWorkflow} /> : null}
            </div>
        </section>
    )
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
    return <button type="button" onClick={onClick} className={cn('flex h-8 items-center gap-1.5 border-b px-2 text-[10px] font-medium', active ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted/70')}>{icon}{label}<span className="font-mono text-[8px] opacity-60">{count}</span></button>
}

function AgentRows({ agents, selectedAgentRunId, onSelectAgent, onAgentAction }: AssistantFleetWorkspaceProps & { agents: AgentRunState[] }) {
    if (!agents.length) return <Empty icon={<Bot size={18} />} text="No child agents in this thread." />
    return <div className="space-y-1.5">{agents.map((run) => (
        <article key={run.agentRunId} className={cn('rounded-lg border p-2.5 transition-colors', run.agentRunId === selectedAgentRunId ? 'border-[color-mix(in_srgb,var(--accent-primary)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]' : 'border-white/[0.06] bg-white/[0.018] hover:bg-white/[0.035]')} onClick={() => onSelectAgent(run.agentRunId)}>
            <div className="flex items-center justify-between gap-2"><strong className="truncate text-[11px] text-sparkle-text">{run.label}</strong><Status value={run.status} /></div>
            <p className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-sparkle-text-muted/75">{run.goal}</p>
            <small className="mt-1.5 block text-[8px] text-sparkle-text-muted/55">{shortModel(run.selectedModel)} · {run.usage.totalTokens ?? 0} tokens · {formatElapsed(run.elapsedMs)}</small>
            <nav className="mt-2 flex gap-1" onClick={(event) => event.stopPropagation()}>
                {['running', 'waiting', 'blocked', 'starting'].includes(run.status) && <Action icon={<Square size={8} />} label="Stop" onClick={() => onAgentAction?.('stop', run.agentRunId)} />}
                {['failed', 'cancelled', 'interrupted'].includes(run.status) && <Action icon={<RotateCcw size={9} />} label="Retry" onClick={() => onAgentAction?.('retry', run.agentRunId)} />}
                {run.status === 'interrupted' && <Action icon={<GitBranch size={9} />} label="Resume" onClick={() => onAgentAction?.('resume', run.agentRunId)} />}
            </nav>
        </article>
    ))}</div>
}

function AgentDetail({ run, transcript, loading, onLoadOlder }: { run: AgentRunState; transcript: AgentTranscriptPage | null; loading: boolean; onLoadOlder: () => void }) {
    return <section className="mt-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 text-[9px] leading-4 text-sparkle-text-muted/70">
        <h3 className="text-[10px] font-semibold text-sparkle-text">Run details</h3>
        <dl className="mt-1 grid grid-cols-[62px_1fr] gap-x-2"><dt>Model</dt><dd>{run.selectedModel}{run.modelRoute?.fallback ? ` · fallback: ${run.modelRoute.fallbackReason}` : ''}</dd><dt>Effort</dt><dd>{run.effort}</dd><dt>Tools</dt><dd>{run.grantedTools.join(', ') || 'none'}</dd><dt>Isolation</dt><dd>{run.isolation}</dd><dt>Worktree</dt><dd className="break-all">{run.worktree?.directory || 'none'}</dd><dt>Result</dt><dd>{run.result?.text || run.error?.message || 'pending'}</dd></dl>
        <h3 className="mt-3 text-[10px] font-semibold text-sparkle-text">Transcript</h3>
        {transcript?.nextBefore != null ? <button type="button" onClick={onLoadOlder} disabled={loading} className="mt-1 text-[8px] text-[var(--accent-primary)] disabled:opacity-50">Load older entries</button> : null}
        {loading && !transcript ? <LoaderCircle size={12} className="mt-2 animate-spin" /> : transcript?.entries.length ? <div className="mt-1 space-y-1.5">{transcript.entries.map((entry) => { const message = transcriptMessage(entry); return <div key={entry.index}><strong className="text-sparkle-text-secondary">{message.role}</strong><p className="whitespace-pre-wrap">{message.text}</p></div> })}</div> : <p>Transcript is available after the child session starts.</p>}
    </section>
}

function WorkflowRows({ workflows, selectedWorkflowRunId, onSelectWorkflow, onWorkflowAction }: AssistantFleetWorkspaceProps & { workflows: WorkflowRunState[] }) {
    if (!workflows.length) return <Empty icon={<Network size={18} />} text="No workflows in this thread." />
    return <div className="space-y-1.5">{workflows.map((run) => {
        const completed = Object.values(run.calls).filter((call) => ['completed', 'cached'].includes(call.status)).length
        return <article key={run.workflowRunId} className={cn('rounded-lg border p-2.5', run.workflowRunId === selectedWorkflowRunId ? 'border-[color-mix(in_srgb,var(--accent-primary)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]' : 'border-white/[0.06] bg-white/[0.018]')} onClick={() => onSelectWorkflow(run.workflowRunId)}>
            <div className="flex items-center justify-between gap-2"><strong className="truncate text-[11px] text-sparkle-text">{run.definitionName}</strong><Status value={run.status} /></div>
            <p className="mt-1 text-[9px] text-sparkle-text-muted/70">{completed}/{Object.keys(run.calls).length || run.projected.requests} agents · {run.cacheHits} cached</p>
            <nav className="mt-2 flex gap-1" onClick={(event) => event.stopPropagation()}>{run.status === 'running' && <Action label="Pause" onClick={() => onWorkflowAction?.('pause', run.workflowRunId)} />}{run.status === 'paused' && <Action label="Resume" onClick={() => onWorkflowAction?.('resume', run.workflowRunId)} />}{['running', 'paused'].includes(run.status) && <Action label="Stop" onClick={() => onWorkflowAction?.('stop', run.workflowRunId)} />}{['failed', 'partial', 'cancelled'].includes(run.status) && <Action label="Restart" onClick={() => onWorkflowAction?.('restart', run.workflowRunId)} />}{run.status === 'completed' && <Action label="Save" onClick={() => onWorkflowAction?.('save', run.workflowRunId)} />}</nav>
        </article>
    })}</div>
}

function WorkflowDetail({ run }: { run: WorkflowRunState }) { return <section className="mt-2 rounded-lg border border-white/[0.06] bg-black/10 p-3"><h3 className="text-[10px] font-semibold text-sparkle-text">Workflow phases</h3><div className="mt-2 space-y-1">{Object.values(run.phases).map((phase) => <div key={phase.phaseId} className="flex justify-between text-[9px] text-sparkle-text-muted/70"><span>{phase.name}</span><Status value={phase.status} /></div>)}</div></section> }
function Empty({ icon, text }: { icon: ReactNode; text: string }) { return <div className="flex flex-col items-center gap-2 py-12 text-[10px] text-sparkle-text-muted/55">{icon}<p>{text}</p></div> }
function Status({ value }: { value: string }) { return <span className="shrink-0 rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[8px] text-sparkle-text-muted/75">{value}</span> }
function Action({ icon, label, onClick }: { icon?: ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded border border-white/[0.07] px-1.5 py-1 text-[8px] text-sparkle-text-muted hover:bg-white/[0.05]">{icon}{label}</button> }
function transcriptMessage(entry: Record<string, unknown>) {
    const message = entry['message'] && typeof entry['message'] === 'object' ? entry['message'] as Record<string, unknown> : entry
    const content = Array.isArray(message['content']) ? message['content'] : []
    const text = content.map((part) => part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text || '') : '').filter(Boolean).join('\n')
    return { role: String(message['role'] || entry['type'] || 'entry'), text: text || String(message['text'] || message['content'] || '') }
}
function newestFirst(left: { createdAt: string }, right: { createdAt: string }) { return right.createdAt.localeCompare(left.createdAt) }
function shortModel(model: string) { return model.split('/').at(-1)?.replace('gpt-5.6-', '') ?? model }
function formatElapsed(ms: number) { const seconds = Math.round((ms || 0) / 1000); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s` }
