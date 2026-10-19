import type { AgentRunState, AgentTranscriptPage, FleetSnapshot, WorkflowNodeStatus, WorkflowRunState } from '@shared/assistant/contracts'

// Entirely synthetic, deterministic and inert. Never combine with saved runs.
const statuses: WorkflowRunState['status'][] = ['awaiting-approval', 'running', 'paused', 'completed', 'partial', 'failed', 'cancelled', 'recovering', 'queued', 'draft']
const topics = ['release-readiness', 'notification-delivery', 'migration-plan', 'request-routing', 'provider-latency', 'flaky-test-repair', 'onboarding', 'settings-persistence', 'cache-invalidation', 'documentation', 'deployment', 'synchronization-and-recovery']
const areas = ['web', 'desktop', 'api', 'mobile', 'dashboard', 'editor', 'search', 'notifications']
const recipes = [
    [{ name: 'Review', tasks: ['Review correctness', 'Review security'] }, { name: 'Decide', tasks: ['Summarize findings'] }],
    [{ name: 'Inspect', tasks: ['Trace the failure'] }, { name: 'Fix', tasks: ['Patch the handler'] }, { name: 'Verify', tasks: ['Run regression tests'] }],
    [{ name: 'Investigate', tasks: ['Trace requests', 'Inspect cache behavior', 'Check error handling'] }, { name: 'Synthesize', tasks: ['Compare findings'] }],
    [{ name: 'Investigate', tasks: ['Reproduce the bug', 'Trace the failure'] }, { name: 'Fix', tasks: ['Apply the patch'] }, { name: 'Verify', tasks: ['Run unit tests', 'Review the diff'] }]
]
const models = ['openai-codex/gpt-6-luna', 'anthropic/claude-sonnet-demo', 'google/gemini-demo']
const stamp = (seconds: number) => new Date(Date.UTC(2026, 9, 19, 6) + seconds * 1_000).toISOString()
function phaseStatus(status: WorkflowRunState['status'], index: number): WorkflowNodeStatus {
    if (['awaiting-approval', 'draft', 'queued'].includes(status)) return 'queued'
    if (status === 'completed' || index === 0) return 'completed'
    if (index > 1) return status === 'partial' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'pending'
    return status === 'paused' ? 'blocked' : status === 'failed' || status === 'partial' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'running'
}
function totalUsage(runs: Array<{ usage: AgentRunState['usage'] }>) {
    return runs.reduce((sum, run) => ({ totalTokens: sum.totalTokens + (run.usage.totalTokens || 0), requests: sum.requests + (run.usage.requests || 0), cost: sum.cost + (run.usage.cost || 0) }), { totalTokens: 0, requests: 0, cost: 0 })
}
function transcript(agent: AgentRunState, result: string): AgentTranscriptPage['entries'] {
    const message = (index: number, role: string, content: unknown[], phase?: string, extra = {}) => ({ index, type: 'message', timestamp: new Date(Date.parse(agent.startedAt!) + index * 1_000).toISOString(), message: { role, content, ...(phase ? { phase } : {}), ...extra } })
    const text = (value: string) => [{ type: 'text', text: value }]
    const toolId = `demo-read-${agent.agentRunId}`
    return [
        message(0, 'user', text(agent.goal)),
        message(1, 'assistant', text('I will inspect the supplied inputs and check the expected behavior.'), 'commentary'),
        message(2, 'assistant', [{ type: 'toolCall', id: toolId, name: 'read', arguments: { path: 'demo/src/example.ts' } }], 'commentary'),
        message(3, 'toolResult', text('Synthetic source fixture. No real files were read.'), undefined, { toolCallId: toolId, isError: false }),
        message(4, 'assistant', text('Checking the observed behavior against the supplied regression case.'), 'commentary'),
        ...(agent.status === 'completed' ? [message(5, 'assistant', text(result), 'final_answer')] : [])
    ]
}
export function createWorkflowReviewSeed() {
    const workflows: FleetSnapshot['workflows'] = {}, agents: FleetSnapshot['agents'] = {}
    const relationships: FleetSnapshot['relationships'] = []
    const transcripts: Record<string, AgentTranscriptPage['entries']> = {}
    for (let i = 0; i < 96; i++) {
        const number = String(i + 1).padStart(3, '0'), status = statuses[i % statuses.length]!
        const recipe = recipes[i % recipes.length]!
        const workflowRunId = `demo-workflow-${number}`
        const definitionName = `${topics[i % topics.length]}-${areas[Math.floor(i / topics.length)]}`
        const failure = ['Security review found an unchecked input.', 'Expected one notification, observed two.', 'Conflicting findings need review.', 'Regression check still fails after the patch.'][i % recipes.length]!
        const settled = ['completed', 'failed', 'cancelled', 'partial'].includes(status)
        const hasStarted = !['queued', 'draft', 'awaiting-approval'].includes(status)
        const phases: WorkflowRunState['phases'] = {}, calls: WorkflowRunState['calls'] = {}
        const children: AgentRunState[] = []
        let ordinal = 0
        recipe.forEach((stage, stageIndex) => {
            const phaseId = `demo-phase-${number}-${stageIndex + 1}`
            const state = phaseStatus(status, stageIndex)
            const stageStarted = !['queued', 'pending'].includes(state) && !(status === 'cancelled' && stageIndex > 1)
            const stageStopped = ['completed', 'failed', 'cancelled'].includes(state)
            const stageError = state === 'failed' ? failure : null
            phases[phaseId] = { phaseId, name: stage.name, status: state, startedAt: stageStarted ? stamp(i * 120 + stageIndex * 30) : null, completedAt: stageStarted && stageStopped ? stamp(i * 120 + stageIndex * 30 + 20) : null, error: stageError }
            stage.tasks.forEach((task, taskIndex) => {
                ordinal++
                const callId = `demo-call-${number}-${ordinal}`, agentRunId = `demo-agent-${number}-${ordinal}`
                // A failed parallel stage can retain successful sibling results.
                const nodeStatus = state === 'failed' && taskIndex < stage.tasks.length - 1 ? 'completed' : state
                const done = nodeStatus === 'completed', stopped = ['completed', 'failed', 'cancelled'].includes(nodeStatus)
                const model = models[(i + ordinal) % models.length]!
                const error = nodeStatus === 'failed' ? stageError : null
                const createdAt = stamp(i * 120)
                const startedAt = stageStarted ? stamp(i * 120 + stageIndex * 30 + taskIndex) : null
                const completedAt = stageStarted && stopped ? stamp(i * 120 + stageIndex * 30 + 15 + taskIndex) : null
                const agentStatus: AgentRunState['status'] = done ? 'completed' : nodeStatus === 'failed' ? 'failed' : nodeStatus === 'cancelled' ? 'cancelled' : nodeStatus === 'blocked' ? 'blocked' : nodeStatus === 'running' ? (status === 'recovering' ? 'recovering' : 'running') : 'queued'
                const result = `${task} finished for the synthetic ${definitionName.replaceAll('-', ' ')} fixture. No real work ran.`
                const agent: AgentRunState = {
                    version: 1, rootSessionId: 'demo-session', agentRunId, agentId: `demo-role-${ordinal}`, definitionName: null, label: task,
                    parentAgentRunId: null, workflowRunId, workflowPhaseId: phaseId, workflowCallId: callId,
                    goal: `${task} for the supplied synthetic ${definitionName.replaceAll('-', ' ')} fixture. Report the observed result without starting live work.`,
                    status: agentStatus, depth: 1, contextFork: false, conversationKind: 'subagent', attempt: status === 'recovering' && stageIndex === 1 ? 2 : 1, maxAttempts: 2,
                    requestedModel: model, selectedModel: model, modelRoute: null, effort: (['low', 'medium', 'high'] as const)[stageIndex % 3]!,
                    requestedTools: ['read'], grantedTools: ['read'], deniedTools: [], deniedCapabilities: [], controlLease: null,
                    permissionMode: 'read-only', isolation: 'shared-read', readScope: ['demo/'], writeScope: [], sessionFile: stageStarted ? `demo/transcripts/${agentRunId}.jsonl` : null, providerSessionId: null, worktree: null,
                    activity: stageStarted && !stopped ? { kind: 'tool', summary: nodeStatus === 'blocked' ? 'Waiting for review' : 'Checking the regression case', updatedAt: stamp(i * 120 + stageIndex * 30 + 10) } : null,
                    usage: stageStarted ? { totalTokens: 1_400 + i * 21 + ordinal * 300, requests: 1, cost: (i + ordinal + 1) / 1_000 } : { totalTokens: 0, requests: 0, cost: 0 },
                    result: done ? { text: result } : null, error: error ? { message: error } : agentStatus === 'cancelled' ? { message: 'Stopped in demo.', interruption: { kind: 'stopped', source: 'user' } } : null,
                    createdAt, queuedAt: createdAt, startedAt, completedAt, elapsedMs: stageStarted && stopped ? 15_000 : 0
                }
                calls[callId] = { callId, phaseId, agentRunId, agentName: task, status: nodeStatus, cached: false, requestedModel: model, selectedModel: model, result: done ? result : null, error, createdAt, startedAt, completedAt }
                agents[agentRunId] = agent; children.push(agent)
                relationships.push({ parentAgentRunId: null, childAgentRunId: agentRunId, workflowRunId, workflowPhaseId: phaseId })
                if (stageStarted) transcripts[agentRunId] = transcript(agent, result)
            })
        })
        workflows[workflowRunId] = {
            version: 1, rootSessionId: 'demo-session', workflowRunId, definitionName, definitionPath: `demo/workflows/${number}.mjs`, definitionHash: `demo-hash-${number}`,
            status, attempt: status === 'recovering' ? 2 : 1, args: { area: areas[Math.floor(i / topics.length)], target: 'demo/src/example.ts' },
            projected: { totalTokens: 15_000, requests: children.length, cost: 0.5 }, budget: { maxCalls: 8, maxRequests: 12, maxTokens: 30_000, maxCostUsd: 2, maxConcurrency: 3 },
            usage: totalUsage(children), phases, calls, agentRunIds: children.map(agent => agent.agentRunId), cacheHits: 0,
            warnings: status === 'partial' ? ['A check failed. Completed findings remain available.'] : [],
            approvedAt: ['draft', 'awaiting-approval'].includes(status) ? null : stamp(i * 120), createdAt: stamp(i * 120), startedAt: hasStarted ? stamp(i * 120) : null,
            completedAt: settled ? stamp(i * 120 + recipe.length * 30) : null, result: status === 'completed' ? 'All checks completed. Findings are ready for review.' : null,
            error: status === 'failed' ? { message: failure } : null
        }
    }
    const snapshot: FleetSnapshot = {
        version: 1, fleetId: 'demo-fleet', rootSessionId: 'demo-session', rootThreadId: 'demo-thread', lastAppliedSequence: 0, updatedAt: stamp(96 * 120),
        agents, workflows, relationships, artifacts: [], eventWindow: [], usage: totalUsage(Object.values(workflows)),
        truncated: { agents: false, workflows: false, relationships: false, artifacts: false, events: false }
    }
    return { title: 'Workflow demo · synthetic data', threadId: 'demo-thread', savedAt: snapshot.updatedAt, snapshot, transcripts, messages: [] }
}
