import assert from 'node:assert/strict'
import { createWorkflowReviewSeed } from '../src/renderer/src/reviews/agents-review-workflow-fixture'
import { projectAssistantAgentTranscriptMessages, projectAssistantAgentTranscriptActivities } from '../src/renderer/src/pages/assistant/assistant-agent-presentation'
import { ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE, assistantWorkflowDirectoryGroup, projectAssistantWorkflowDirectory } from '../src/renderer/src/pages/assistant/assistant-workflow-directory-model'

const seed = createWorkflowReviewSeed()
const { snapshot } = seed
assert.equal(Object.keys(snapshot.workflows).length, 96)
assert.equal(Object.keys(snapshot.agents).length, 360)
assert.deepEqual(seed, createWorkflowReviewSeed(), 'synthetic fixture is deterministic and independent of user data')
const statuses = new Set<string>()
for (const [id, workflow] of Object.entries(snapshot.workflows)) {
    statuses.add(workflow.status)
    assert.ok(id.startsWith('demo-'))
    assert.equal(workflow.workflowRunId, id)
    assert.ok(workflow.agentRunIds.length >= 3 && workflow.agentRunIds.length <= 5)
    for (const agentId of workflow.agentRunIds) {
        const agent = snapshot.agents[agentId]!
        assert.ok(agentId.startsWith('demo-'))
        assert.equal(agent.workflowRunId, id)
        const call = workflow.calls[agent.workflowCallId!]!
        const phase = workflow.phases[agent.workflowPhaseId!]!
        assert.equal(call.agentRunId, agentId)
        assert.equal(call.phaseId, phase.phaseId)
        assert.ok(call.status === phase.status || (phase.status === 'failed' && call.status === 'completed'), 'failed parallel stages can retain successful sibling results')
        assert.ok(snapshot.relationships.some(r => r.childAgentRunId === agentId && r.workflowRunId === id && r.workflowPhaseId === phase.phaseId))
        const entries = seed.transcripts[agentId]
        if (agent.startedAt) {
            assert.ok(agent.sessionFile?.startsWith('demo/transcripts/'), 'the real transcript hook requires a saved-conversation reference, served only from the isolated fixture')
            assert.ok(entries && entries.length >= 5)
            const messages = projectAssistantAgentTranscriptMessages(entries)
            const activities = projectAssistantAgentTranscriptActivities(entries)
            assert.equal(messages[0]?.role, 'user', 'synthetic requests use the actual transcript message format')
            assert.ok(activities.length >= 1, 'synthetic calls use the actual toolCall/toolResult format')
            assert.equal(messages.some(message => message.phase === 'final_answer'), agent.status === 'completed')
            assert.equal(Boolean(agent.result), agent.status === 'completed')
        } else {
            assert.equal(entries, undefined)
            assert.equal(agent.usage.totalTokens, 0)
        }
        assert.ok(/^(openai-codex|anthropic|google)\//.test(agent.selectedModel), 'provider marks resolve from canonical model IDs')
        if (['completed', 'failed', 'cancelled', 'partial'].includes(workflow.status)) {
            assert.ok(!['running', 'waiting', 'recovering'].includes(agent.status), 'settled workflows have no active children')
        }
    }
    if (workflow.status === 'completed') assert.ok(Object.values(workflow.phases).every(p => p.status === 'completed'))
    if (workflow.status === 'paused') assert.ok(Object.values(workflow.phases).every(p => p.status !== 'running'), 'paused work cannot claim active execution')
    if (['completed', 'failed', 'cancelled', 'partial'].includes(workflow.status)) assert.ok(workflow.completedAt)
}
assert.equal(statuses.size, 10)
const runs = Object.values(snapshot.workflows)
const before = JSON.stringify(runs)
const all = projectAssistantWorkflowDirectory(runs, '', 'all')
assert.equal(all.rows.length, 96)
assert.equal(all.counts.attention + all.counts.active + all.counts.finished, 96)
const rank = { attention: 0, active: 1, finished: 2 }
assert.deepEqual(all.rows.map(r => rank[r.group]), all.rows.map(r => rank[r.group]).sort((a, b) => a - b))
for (const filter of ['attention', 'active', 'finished'] as const) {
    const projected = projectAssistantWorkflowDirectory(runs, '', filter)
    assert.equal(projected.rows.length, all.counts[filter])
    assert.ok(projected.rows.every(r => assistantWorkflowDirectoryGroup(r.run.status) === filter))
}
assert.ok(projectAssistantWorkflowDirectory(runs, 'notification', 'all').rows.length > 0)
assert.equal(projectAssistantWorkflowDirectory(runs, 'no-such-workflow', 'all').rows.length, 0)
assert.equal(JSON.stringify(runs), before, 'sorting and searching cannot mutate canonical state')
assert.equal(ASSISTANT_WORKFLOW_DIRECTORY_PAGE_SIZE, 30)
assert.deepEqual(Array.from({ length: 4 }, (_, page) => all.rows.slice(page * 30, (page + 1) * 30).length), [30, 30, 30, 6])
console.log('Workflow review: 96 workflows, 360 linked agents, sequential and parallel stages, transcript projection, status consistency and bounded directory policy passed')
