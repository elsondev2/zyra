import type { AgentRunState } from './agent-runtime'
import type { WorkflowRunState } from './workflow-runtime'
import type { AssistantTurnUsage } from './runtime'

export interface FleetSnapshot {
    version: number
    fleetId: string
    rootSessionId: string
    rootThreadId: string
    lastAppliedSequence: number
    updatedAt: string
    agents: Record<string, AgentRunState>
    workflows: Record<string, WorkflowRunState>
    relationships: Array<{ parentAgentRunId: string | null; childAgentRunId: string; workflowRunId: string | null; workflowPhaseId: string | null }>
    artifacts: Array<{ artifactId: string; agentRunId: string | null; workflowRunId: string | null; kind: string; path: string | null; createdAt: string }>
    eventWindow: Array<Record<string, unknown>>
    usage: AssistantTurnUsage & { requests?: number; cost?: number }
    truncated: { agents: boolean; workflows: boolean; relationships: boolean; artifacts: boolean; events: boolean }
}

export interface FleetSnapshotEventPayload {
    eventType: string
    event: Record<string, unknown>
    snapshot: FleetSnapshot
}

export type FleetAgentAction = 'list' | 'get' | 'spawn' | 'send' | 'stop' | 'retry' | 'resume' | 'status' | 'wait' | 'transcript'
export type FleetWorkflowAction = 'list' | 'run' | 'status' | 'pause' | 'resume' | 'stop' | 'restart' | 'save'

export interface FleetOperationInput {
    threadId: string
    action: string
    payload?: Record<string, unknown>
}
