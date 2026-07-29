import type { AssistantTurnUsage } from './runtime'

export type WorkflowRunStatus = 'draft' | 'awaiting-approval' | 'queued' | 'running' | 'paused' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'recovering'
export type WorkflowNodeStatus = 'queued' | 'pending' | 'running' | 'completed' | 'cached' | 'failed' | 'cancelled' | 'blocked'

export interface WorkflowPhaseState {
    phaseId: string
    name: string
    status: WorkflowNodeStatus
    startedAt?: string | null
    completedAt?: string | null
    updatedAt?: string
    error?: string | null
}

export interface WorkflowCallState {
    callId: string
    phaseId?: string | null
    agentRunId?: string | null
    agentName?: string | null
    stableKey?: string
    fingerprint?: string
    status: WorkflowNodeStatus
    cached?: boolean
    selectedModel?: string | null
    requestedModel?: string | null
    result?: unknown
    error?: string | { message: string } | null
    createdAt?: string
    startedAt?: string | null
    completedAt?: string | null
}

export interface WorkflowRunState {
    version: number
    rootSessionId: string
    workflowRunId: string
    definitionName: string
    definitionPath: string
    definitionHash: string
    status: WorkflowRunStatus
    attempt: number
    args: Record<string, unknown>
    projected: AssistantTurnUsage & { requests?: number; cost?: number }
    budget: { maxCalls: number; maxRequests: number; maxTokens: number; maxCostUsd: number; maxConcurrency: number }
    usage: AssistantTurnUsage & { requests?: number; cost?: number }
    phases: Record<string, WorkflowPhaseState>
    calls: Record<string, WorkflowCallState>
    agentRunIds: string[]
    cacheHits: number
    warnings: string[]
    approvedAt: string | null
    createdAt: string
    startedAt: string | null
    completedAt: string | null
    result?: unknown
    error: { code?: string; name?: string; message: string } | null
}

export interface WorkflowDefinitionSummary {
    name: string
    description: string
    scope: 'built-in' | 'personal' | 'project' | 'temporary'
    sourcePath: string
    valid: boolean
    runnable: boolean
    errors: string[]
    warnings: string[]
    budgets: { maxCalls: number; maxRequests: number; maxTokens: number; maxCostUsd: number; maxConcurrency: number }
}
