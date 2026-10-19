import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Bot, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { AgentRunState } from '@shared/assistant/contracts'
import { formatAssistantAgentElapsed, formatAssistantAgentTokens, shortAssistantAgentModel } from './assistant-agent-presentation'
import { AssistantAgentAvatar, AssistantAgentStatusBadge } from './AssistantAgentPrimitives'
import { AssistantModelProviderIcon } from './AssistantModelProviderIcon'
import { AssistantDirectorySearch } from './AssistantDirectorySearch'
import {
    ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE,
    projectAssistantAgentDirectory,
    type AssistantAgentDirectoryFilter
} from './assistant-agent-directory-model'
import './assistant-agent-directory.css'

export { ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE } from './assistant-agent-directory-model'

const FILTERS: { value: AssistantAgentDirectoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'finished', label: 'Finished' }
]

export function AssistantAgentDirectory({
    agents, page, onPageChange, onOpenAgent, navigation,
    query = '', filter = 'all', onQueryChange, onFilterChange
}: {
    agents: AgentRunState[]
    page: number
    onPageChange: (page: number) => void
    onOpenAgent: (agentRunId: string) => void
    navigation?: ReactNode
    query?: string
    filter?: AssistantAgentDirectoryFilter
    onQueryChange?: (query: string) => void
    onFilterChange?: (filter: AssistantAgentDirectoryFilter) => void
}) {
    const { rows, counts } = useMemo(() => projectAssistantAgentDirectory(agents, query, filter), [agents, filter, query])
    const pageCount = Math.max(1, Math.ceil(rows.length / ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE))
    const safePage = Math.min(Math.max(0, page), pageCount - 1)
    const pageStart = safePage * ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE
    const visibleRows = rows.slice(pageStart, pageStart + ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    useLayoutEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0
    }, [safePage, query, filter])

    useEffect(() => {
        if (page !== safePage) onPageChange(safePage)
    }, [onPageChange, page, safePage])

    const changeQuery = (value: string) => { onQueryChange?.(value); onPageChange(0) }
    const changeFilter = (value: AssistantAgentDirectoryFilter) => { onFilterChange?.(value); onPageChange(0) }

    return (
        <section className="assistant-agent-directory" data-testid="assistant-agent-directory" data-agent-page-size={ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE}>
            <header className="assistant-agent-directory__toolbar">
                {navigation || <span className="assistant-fleet-section-label">Agents <span>{agents.length}</span></span>}
                <AssistantDirectorySearch entity="agents" query={query} onChange={changeQuery} disabled={!onQueryChange} />
                <select className="assistant-agent-directory__filter" aria-label="Filter agents" value={filter}
                    onChange={event => changeFilter(event.target.value as AssistantAgentDirectoryFilter)} disabled={!onFilterChange}>
                    {FILTERS.map(item => <option key={item.value} value={item.value}>{item.label} · {counts[item.value]}</option>)}
                </select>
            </header>

            <div ref={scrollRef} data-assistant-capsule-scroll="agents-directory" className="assistant-agent-directory__scroll custom-scrollbar">
                {visibleRows.length > 0 ? <>
                    <div className="assistant-agent-directory__columns" aria-hidden="true">
                        <span>Agent</span><span>Task</span><span>Model / effort</span><span>Status</span><span />
                    </div>
                    <ul className="assistant-agent-directory__list" aria-label="Delegated agents">
                        {visibleRows.map(({ run, identity, group }) => {
                            const summary = (run.error?.message || run.activity?.summary || run.goal || 'No task recorded.').replace(/\s+/g, ' ').trim()
                            return <li key={run.agentRunId} data-testid="assistant-agent-row" data-agent-run-id={run.agentRunId} data-agent-group={group}>
                                <button type="button" className="assistant-agent-directory__row" onClick={() => onOpenAgent(run.agentRunId)}
                                    aria-label={`Open ${run.label || identity.name}'s agent transcript`}>
                                    <span className="assistant-agent-directory__identity">
                                        <AssistantAgentAvatar run={run} size={28} />
                                        <span><strong>{identity.name}</strong><span>{identity.roleTitle}</span></span>
                                    </span>
                                    <span className="assistant-agent-directory__task">
                                        <strong title={run.label || run.goal}>{run.label || run.goal || identity.roleTitle}</strong>
                                        <span title={run.goal}>{summary}</span>
                                    </span>
                                    <span className="assistant-agent-directory__usage">
                                        <span className="assistant-agent-directory__model" title={run.selectedModel}>
                                            <AssistantModelProviderIcon model={run.selectedModel} />
                                            <span>{shortAssistantAgentModel(run.selectedModel)}<span aria-hidden="true"> · </span><span title="Reasoning effort">{run.effort}</span></span>
                                        </span>
                                        <span>{formatAssistantAgentTokens(run.usage.totalTokens)} tokens · {formatAssistantAgentElapsed(run.elapsedMs)}</span>
                                    </span>
                                    <span className="assistant-agent-directory__status"><AssistantAgentStatusBadge status={run.status} /></span>
                                    <ChevronRight size={14} className="assistant-agent-directory__open" aria-hidden="true" />
                                </button>
                            </li>
                        })}
                    </ul>
                </> : <div className="assistant-agent-directory__empty">
                    {agents.length === 0 ? <><Bot size={23} /><h3>No delegated work yet</h3><p>Agents appear here when this chat delegates a task.</p></>
                        : <><Search size={22} /><h3>No matching agents</h3><p>Try a different task, name, or status.</p><button type="button" onClick={() => { changeQuery(''); changeFilter('all') }}>Clear filters</button></>}
                </div>}
            </div>

            {agents.length > 0 ? <footer className="assistant-agent-directory__footer" data-testid="assistant-agent-directory-footer">
                <span aria-live="polite">{rows.length ? `${pageStart + 1}–${Math.min(pageStart + ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE, rows.length)} of ${rows.length}` : '0'} agents{rows.length !== agents.length ? ` · ${agents.length} total` : ''}</span>
                {pageCount > 1 ? <nav aria-label="Agent directory pages">
                    <PageButton label="Previous agent page" disabled={safePage === 0} onClick={() => onPageChange(safePage - 1)} icon={<ChevronLeft size={14} />} />
                    <span>{safePage + 1} / {pageCount}</span>
                    <PageButton label="Next agent page" disabled={safePage >= pageCount - 1} onClick={() => onPageChange(safePage + 1)} icon={<ChevronRight size={14} />} />
                </nav> : null}
            </footer> : null}
        </section>
    )
}

function PageButton({ label, disabled, onClick, icon }: { label: string; disabled: boolean; onClick: () => void; icon: ReactNode }) {
    return <button type="button" onClick={onClick} disabled={disabled} aria-label={label}>{icon}</button>
}
