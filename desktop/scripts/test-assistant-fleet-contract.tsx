import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FleetSnapshot } from '../src/shared/assistant/contracts'
import { ASSISTANT_IPC, assertAssistantIpcContract } from '../src/shared/assistant/contracts'
import { applyAssistantDomainEvent, createDefaultAssistantSnapshot } from '../src/shared/assistant/projector'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { projectFleetSnapshot, readFleetSnapshot } from '../src/main/assistant/fleet-persistence'
import { FleetProjection } from '../src/main/assistant/fleet-projection'
import { AssistantFleetWorkspace } from '../src/renderer/src/pages/assistant/AssistantFleetWorkspace'

const now = new Date().toISOString()
const fleet: FleetSnapshot = {
    version: 1,
    fleetId: 'fleet-1',
    rootSessionId: 'root-1',
    rootThreadId: 'thread-1',
    lastAppliedSequence: 9,
    updatedAt: now,
    agents: {
        'agent-1': {
            agentRunId: 'agent-1', rootSessionId: 'root-1', parentAgentRunId: null, workflowRunId: 'workflow-1', workflowPhaseId: 'review', workflowCallId: 'call-1',
            agentId: 'code-reviewer', definitionName: 'code-reviewer', label: 'code-reviewer', goal: 'Review src/auth.ts', status: 'running', depth: 1, contextFork: false,
            attempt: 1, maxAttempts: 1, isolation: 'shared-read', requestedModel: 'terra', selectedModel: 'openai-codex/gpt-5.6-terra', modelRoute: null, effort: 'high',
            requestedTools: ['read'], grantedTools: ['read'], deniedTools: [], deniedCapabilities: [], permissionMode: 'read-only', readScope: ['.'], writeScope: [], sessionFile: null, providerSessionId: null, activity: { kind: 'tool', summary: 'Reading auth', updatedAt: now },
            worktree: null, usage: { totalTokens: 1200 }, result: null, error: null, createdAt: now, queuedAt: now, startedAt: now, completedAt: null, elapsedMs: 1200, version: 1
        }
    },
    workflows: {
        'workflow-1': {
            workflowRunId: 'workflow-1', rootSessionId: 'root-1', definitionName: 'review-changes', definitionPath: 'workflows/review-changes.mjs', definitionHash: 'hash', status: 'running', args: {},
            projected: { requests: 1, totalTokens: 25000, cost: 0 }, budget: { maxCalls: 10, maxRequests: 10, maxTokens: 100000, maxCostUsd: 2, maxConcurrency: 2 },
            usage: { totalTokens: 1200, requests: 1, cost: 0.1 }, phases: { review: { phaseId: 'review', name: 'review', status: 'running', startedAt: now, completedAt: null, error: null } },
            calls: { 'call-1': { callId: 'call-1', phaseId: 'review', agentRunId: 'agent-1', agentName: 'code-reviewer', status: 'running', cached: false, result: null, error: null, createdAt: now, startedAt: now, completedAt: null } },
            agentRunIds: ['agent-1'], cacheHits: 0, warnings: [], approvedAt: now, createdAt: now, startedAt: now, completedAt: null, error: null, version: 1
        }
    },
    relationships: [{ parentAgentRunId: null, childAgentRunId: 'agent-1', workflowRunId: 'workflow-1', workflowPhaseId: 'review' }],
    artifacts: [{ artifactId: 'artifact-1', agentRunId: 'agent-1', workflowRunId: 'workflow-1', kind: 'diff', path: 'src/auth.ts', createdAt: now }],
    eventWindow: [{ type: 'agent.activity' }],
    usage: { totalTokens: 1200, requests: 1, cost: 0.1 },
    truncated: { agents: false, workflows: false, relationships: false, artifacts: false, events: false }
}

assertAssistantIpcContract()
assert.equal(ASSISTANT_IPC.agentAction, 'devscope:assistant:agentAction')
assert.equal(ASSISTANT_IPC.workflowAction, 'devscope:assistant:workflowAction')
assert.equal(ASSISTANT_IPC.getFleetSnapshot, 'devscope:assistant:getFleetSnapshot')

const projection = new FleetProjection()
assert.equal(projection.apply('thread-1', fleet).agents['agent-1']?.label, 'code-reviewer')
assert.equal(projection.get('thread-1')?.workflows['workflow-1']?.definitionName, 'review-changes')

const domainSnapshot = applyAssistantDomainEvent(createDefaultAssistantSnapshot(), {
    sequence: 1,
    eventId: 'event-1',
    type: 'fleet.snapshot.updated',
    occurredAt: now,
    threadId: 'thread-1',
    payload: { threadId: 'thread-1', snapshot: fleet }
})
assert.equal(domainSnapshot.fleetByThreadId['thread-1']?.lastAppliedSequence, 9)

const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
db.run("INSERT INTO assistant_sessions (id, title, mode, archived, created_at, updated_at) VALUES ('session-existing', 'Existing', 'work', 0, ?, ?)", [now, now])
projectFleetSnapshot(db, 'thread-1', fleet)
assert.equal(readFleetSnapshot(db, 'thread-1')?.agents['agent-1']?.status, 'running')
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_sessions WHERE id = 'session-existing'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_agent_runs WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_workflow_calls WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_agent_relationships WHERE root_thread_id = 'thread-1'")[0]?.values[0]?.[0], 1)

globalThis.window = { devscope: { assistant: { agentAction: async () => ({ success: true, result: {} }) } } } as unknown as Window & typeof globalThis
const markup = renderToStaticMarkup(<AssistantFleetWorkspace threadId="thread-1" snapshot={fleet} selectedAgentRunId="agent-1" selectedWorkflowRunId={null} onSelectAgent={() => {}} onSelectWorkflow={() => {}} />)
assert.match(markup, /Agents/)
assert.match(markup, /code-reviewer/)
assert.match(markup, /Run details/)
assert.match(markup, /openai-codex\/gpt-5\.6-terra/)

const root = path.resolve(import.meta.dirname, '..', '..')
const [bridge, adapter, inspector] = await Promise.all([
    readFile(path.join(root, 'src', 'zyra-ui-bridge.mjs'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'preload', 'adapters', 'assistant-adapter.ts'), 'utf8'),
    readFile(path.join(root, 'desktop', 'src', 'renderer', 'src', 'pages', 'assistant', 'AssistantDiffPanel.tsx'), 'utf8')
])
for (const operation of ['agents.list', 'agents.spawn', 'agents.transcript', 'workflows.run', 'workflows.restart']) assert(bridge.includes(`case "${operation}"`))
assert(adapter.includes('ASSISTANT_IPC.agentAction'))
assert(adapter.includes('ASSISTANT_IPC.workflowAction'))
assert(inspector.includes('AssistantFleetWorkspace'))

console.log('Desktop assistant fleet contract tests passed.')
