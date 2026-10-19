import type { WorkflowCallState, WorkflowPhaseState, WorkflowRunState } from '@shared/assistant/contracts'

export interface WorkflowExecutionStage {
    id: string
    name: string
    phase: WorkflowPhaseState | null
    calls: WorkflowCallState[]
    concurrent: boolean
    /** Only chronological succession, never a claimed data dependency. */
    followsPrevious: boolean
}
const timestamp = (value?: string | null) => value ? Date.parse(value) : NaN

function concurrentCalls(calls: WorkflowCallState[]): boolean {
    if (calls.length < 2 || calls.some(call => !Number.isFinite(timestamp(call.startedAt)))) return false
    const latestStart = Math.max(...calls.map(call => timestamp(call.startedAt)))
    const earliestEnd = Math.min(...calls.map(call => call.completedAt ? timestamp(call.completedAt) : ['running', 'blocked'].includes(call.status) ? Infinity : NaN))
    return latestStart < earliestEnd
}

/** Saved runtime phases own calls. The snapshot contains no dependency graph. */
export function projectWorkflowExecution(run: WorkflowRunState): WorkflowExecutionStage[] {
    const calls = Object.values(run.calls)
    const phases = Object.values(run.phases)
    const stages: WorkflowExecutionStage[] = phases.map((phase, index) => ({
        id: phase.phaseId, name: phase.name, phase,
        calls: calls.filter(call => call.phaseId === phase.phaseId),
        concurrent: false,
        followsPrevious: index > 0 && Number.isFinite(timestamp(phases[index - 1]!.completedAt))
            && timestamp(phases[index - 1]!.completedAt) <= timestamp(phase.startedAt)
    }))
    const unphased = calls.filter(call => !call.phaseId || !run.phases[call.phaseId])
    if (unphased.length) stages.push({ id: '__unphased', name: phases.length ? 'Other agents' : 'Agents', phase: null, calls: unphased, concurrent: false, followsPrevious: false })
    return stages.map(stage => ({ ...stage, concurrent: concurrentCalls(stage.calls) }))
}

export function workflowCallError(call: WorkflowCallState): string {
    return typeof call.error === 'string' ? call.error : call.error?.message || ''
}
