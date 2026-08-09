import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Bot, Workflow } from 'lucide-react'
import type { FleetSnapshot } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { AssistantAgentDetailPage } from './AssistantAgentDetailPage'
import { AssistantAgentDirectory } from './AssistantAgentDirectory'
import type { AssistantAgentAction } from './AssistantAgentPrimitives'
import { AssistantWorkflowDetailPage } from './AssistantWorkflowDetailPage'
import { AssistantWorkflowDirectory } from './AssistantWorkflowDirectory'
import type { AssistantWorkflowAction } from './AssistantWorkflowPrimitives'
import { useAssistantAgentTranscript } from './useAssistantAgentTranscript'

interface AssistantFleetWorkspaceProps {
    threadId: string | null
    snapshot: FleetSnapshot | null
    selectedAgentRunId: string | null
    selectedWorkflowRunId: string | null
    onSelectAgent: (agentRunId: string | null) => void
    onSelectWorkflow: (workflowRunId: string | null) => void
    onAgentAction?: (action: AssistantAgentAction, agentRunId: string) => void
    onWorkflowAction?: (action: AssistantWorkflowAction, workflowRunId: string) => void
}

export function AssistantFleetWorkspace(props: AssistantFleetWorkspaceProps) {
    const [tab, setTab] = useState<'agents' | 'workflows'>('agents')
    const [agentPage, setAgentPage] = useState(0)
    const [workflowPage, setWorkflowPage] = useState(0)
    const agents = useMemo(() => Object.values(props.snapshot?.agents ?? {}).sort(newestFirst), [props.snapshot])
    const workflows = useMemo(() => Object.values(props.snapshot?.workflows ?? {}).sort(newestFirst), [props.snapshot])
    const selectedAgent = agents.find((run) => run.agentRunId === props.selectedAgentRunId) ?? null
    const selectedWorkflow = workflows.find((run) => run.workflowRunId === props.selectedWorkflowRunId) ?? null
    const transcript = useAssistantAgentTranscript(props.threadId, selectedAgent)
    const handleOpenWorkflowAgent = useCallback((agentRunId: string) => {
        props.onSelectAgent(agentRunId)
        setTab('agents')
    }, [props.onSelectAgent])

    return (
        <section className="flex min-h-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]" data-testid="assistant-fleet-workspace">
            <header className="flex h-9 shrink-0 items-end gap-1 border-b border-white/[0.06] px-2">
                <TabButton active={tab === 'agents'} onClick={() => setTab('agents')} icon={<Bot size={12} />} label="Agents" count={agents.length} />
                <TabButton active={tab === 'workflows'} onClick={() => setTab('workflows')} icon={<Workflow size={12} />} label="Workflows" count={workflows.length} />
            </header>

            {tab === 'agents' ? (
                selectedAgent ? (
                    <AssistantAgentDetailPage
                        run={selectedAgent}
                        transcript={transcript.page}
                        loading={transcript.loading}
                        error={transcript.error}
                        onBack={() => props.onSelectAgent(null)}
                        onLoadOlder={() => void transcript.loadOlder()}
                        onRetry={transcript.retry}
                        onAgentAction={props.onAgentAction}
                    />
                ) : (
                    <AssistantAgentDirectory
                        agents={agents}
                        page={agentPage}
                        onPageChange={setAgentPage}
                        onOpenAgent={props.onSelectAgent}
                        onAgentAction={props.onAgentAction}
                    />
                )
            ) : selectedWorkflow ? (
                <AssistantWorkflowDetailPage
                    run={selectedWorkflow}
                    agents={props.snapshot?.agents ?? {}}
                    onBack={() => props.onSelectWorkflow(null)}
                    onOpenAgent={handleOpenWorkflowAgent}
                    onWorkflowAction={props.onWorkflowAction}
                />
            ) : (
                <AssistantWorkflowDirectory
                    workflows={workflows}
                    page={workflowPage}
                    onPageChange={setWorkflowPage}
                    onOpenWorkflow={props.onSelectWorkflow}
                    onWorkflowAction={props.onWorkflowAction}
                />
            )}
        </section>
    )
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn('flex h-8 items-center gap-1.5 border-b px-2 text-[10px] font-medium', active ? 'border-[var(--accent-primary)] text-sparkle-text' : 'border-transparent text-sparkle-text-muted/70')}
        >
            {icon}{label}<span className="font-mono text-[8px] opacity-60">{count}</span>
        </button>
    )
}

function newestFirst(left: { createdAt: string }, right: { createdAt: string }) {
    return right.createdAt.localeCompare(left.createdAt)
}
