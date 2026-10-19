import type { WorkflowRunState, WorkflowRunStatus } from '@shared/assistant/contracts'
import { formatAssistantWorkflowInput, resolveAssistantWorkflowIdentity } from './assistant-workflow-presentation'

export const ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE = 30
export type AssistantWorkflowDirectoryFilter = 'all' | 'attention' | 'active' | 'finished'
export function assistantWorkflowDirectoryGroup(status: WorkflowRunStatus): Exclude<AssistantWorkflowDirectoryFilter, 'all'> {
    if (['awaiting-approval', 'paused', 'failed', 'partial'].includes(status)) return 'attention'
    return status === 'completed' || status === 'cancelled' ? 'finished' : 'active'
}
export function projectAssistantWorkflowDirectory(workflows: WorkflowRunState[], query: string, filter: AssistantWorkflowDirectoryFilter) {
    const counts = { all: workflows.length, attention: 0, active: 0, finished: 0 }
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    const order = { attention: 0, active: 1, finished: 2 }
    const rows = workflows.flatMap(run => {
        const group = assistantWorkflowDirectoryGroup(run.status)
        counts[group] += 1
        if (filter !== 'all' && filter !== group) return []
        const identity = resolveAssistantWorkflowIdentity(run)
        const haystack = [identity.name, run.definitionName, run.status, run.error?.message,
            formatAssistantWorkflowInput(run.args), ...run.warnings,
            ...Object.values(run.phases).map(phase => `${phase.name} ${phase.status}`),
            ...Object.values(run.calls).map(call => `${call.agentName || ''} ${call.selectedModel || ''}`)].join(' ').toLocaleLowerCase()
        return terms.every(term => haystack.includes(term)) ? [{ run, identity, group }] : []
    }).sort((left, right) => order[left.group] - order[right.group]
        || right.run.createdAt.localeCompare(left.run.createdAt) || left.run.workflowRunId.localeCompare(right.run.workflowRunId))
    return { rows, counts }
}
export function assistantWorkflowCurrentPhase(run: WorkflowRunState): string {
    if (run.status === 'awaiting-approval') return 'Awaiting approval'
    const phases = Object.values(run.phases)
    const current = phases.find(phase => phase.status === 'failed' || phase.status === 'blocked')
        || phases.find(phase => phase.status === 'running')
        || phases.find(phase => phase.status === 'pending' || phase.status === 'queued')
    return current?.name || (run.status === 'completed' ? 'All phases complete' : run.status === 'cancelled' ? 'Stopped' : 'Not started')
}
