import type { AgentRunState, AgentRunStatus } from '@shared/assistant/contracts'
import { resolveAssistantAgentIdentity } from './assistant-agent-presentation'

export const ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE = 30
export type AssistantAgentDirectoryFilter = 'all' | 'active' | 'attention' | 'finished'

export function assistantAgentDirectoryGroup(status: AgentRunStatus): Exclude<AssistantAgentDirectoryFilter, 'all'> {
    if (['blocked', 'failed', 'interrupted'].includes(status)) return 'attention'
    if (['completed', 'cancelled'].includes(status)) return 'finished'
    return 'active'
}

export function projectAssistantAgentDirectory(agents: AgentRunState[], query: string, filter: AssistantAgentDirectoryFilter) {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    const counts = { all: agents.length, active: 0, attention: 0, finished: 0 }
    const priority = { attention: 0, active: 1, finished: 2 }
    const rows = agents.flatMap(run => {
        const group = assistantAgentDirectoryGroup(run.status)
        counts[group]++
        if (filter !== 'all' && filter !== group) return []
        const identity = resolveAssistantAgentIdentity(run)
        const searchable = [run.label, run.goal, run.agentId, run.definitionName, run.selectedModel, run.status,
            identity.name, identity.roleTitle, run.activity?.summary, run.error?.message].filter(Boolean).join(' ').toLocaleLowerCase()
        if (!terms.every(term => searchable.includes(term))) return []
        return [{ run, identity, group }]
    }).sort((left, right) => priority[left.group] - priority[right.group]
        || right.run.createdAt.localeCompare(left.run.createdAt)
        || left.run.agentRunId.localeCompare(right.run.agentRunId))
    return { rows, counts }
}
