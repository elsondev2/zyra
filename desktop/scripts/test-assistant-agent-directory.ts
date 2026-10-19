import assert from 'node:assert/strict'
import type { AgentRunState, AgentRunStatus } from '../src/shared/assistant/contracts'
import { assistantAgentDirectoryGroup, projectAssistantAgentDirectory, ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE } from '../src/renderer/src/pages/assistant/assistant-agent-directory-model'

const statuses: AgentRunStatus[] = ['queued', 'starting', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancelled', 'interrupted', 'recovering']
const agents = statuses.map((status, index) => ({
    agentRunId: `agent-${index}`, agentId: 'researcher', definitionName: null,
    label: `Review ${index}`, goal: index === 4 ? 'Audit secret handling in permissions' : 'Investigate rendering performance',
    status, selectedModel: 'openai-codex/gpt-6.1-sol', activity: null,
    error: status === 'failed' ? { message: 'Connection dropped' } : null,
    createdAt: new Date(Date.UTC(2026, 9, 19, 0, index)).toISOString()
} as AgentRunState))
const original = agents.map(run => run.agentRunId)
const all = projectAssistantAgentDirectory(agents, '', 'all')
assert.deepEqual(all.counts, { all: 10, active: 5, attention: 3, finished: 2 })
assert.deepEqual(all.rows.slice(0, 3).map(row => row.run.status), ['interrupted', 'failed', 'blocked'])
assert.equal(all.rows[3]?.run.status, 'recovering', 'newest active work follows attention items')
assert.deepEqual(agents.map(run => run.agentRunId), original, 'projection cannot reorder the canonical snapshot')
assert.equal(assistantAgentDirectoryGroup('cancelled'), 'finished')
assert.equal(assistantAgentDirectoryGroup('blocked'), 'attention')
assert.equal(projectAssistantAgentDirectory(agents, 'SECRET permissions', 'all').rows[0]?.run.status, 'blocked')
assert.equal(projectAssistantAgentDirectory(agents, 'connection dropped', 'attention').rows[0]?.run.status, 'failed')
assert.equal(projectAssistantAgentDirectory(agents, 'gpt-6.1-sol', 'active').rows.length, 5)
assert.equal(projectAssistantAgentDirectory(agents, '', 'finished').rows.length, 2)
assert.equal(projectAssistantAgentDirectory(agents, 'no such task', 'all').rows.length, 0)
const named = all.rows[0]!
assert.equal(projectAssistantAgentDirectory(agents, named.identity.name, 'all').rows.some(row => row.run.agentRunId === named.run.agentRunId), true, 'generated identities remain searchable')
assert.equal(projectAssistantAgentDirectory([], '', 'all').rows.length, 0)
const large = Array.from({ length: 1000 }, (_, index) => ({ ...agents[index % agents.length]!, agentRunId: `large-${index}` }))
const projected = projectAssistantAgentDirectory(large, '', 'all')
assert.equal(projected.rows.length, 1000, 'search keeps every saved run available')
assert.equal(projected.rows.slice(0, ASSISTANT_AGENT_DIRECTORY_PAGE_SIZE).length, 30, 'rendered pages stay bounded')
console.log('Agent directory: status groups, attention order, search, immutability and 1000-run paging passed')
