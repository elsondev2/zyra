import assert from 'node:assert/strict'
import { AgentDockComponent } from '../src/tui/components/agent-dock.mjs'
import { AgentManagerComponent } from '../src/tui/components/agent-manager.mjs'
import { SubagentMessageComponent } from '../src/tui/components/subagent-message.mjs'
import { WorkflowManagerComponent } from '../src/tui/components/workflow-manager.mjs'
import { WorkflowMessageComponent } from '../src/tui/components/workflow-message.mjs'
import { ZyraComponentHost } from '../src/tui/component-host.mjs'
import { applySlashSuggestion, getSlashSuggestions } from '../src/slash-suggestions.mjs'

const now = new Date().toISOString()
const agent = {
  agentRunId: 'agent-1', agentId: 'code-reviewer', label: 'code-reviewer', goal: 'Review changed authentication code', status: 'running',
  selectedModel: 'openai-codex/gpt-5.6-terra', effort: 'high', usage: { totalTokens: 12345 }, elapsedMs: 4200, createdAt: now,
  activity: { summary: 'Reading src/auth.mjs' }, isolation: 'shared', attempt: 1,
}
const workflow = {
  workflowRunId: 'workflow-1', definitionName: 'review-changes', status: 'running', createdAt: now, projected: { requests: 3 },
  phases: { discover: { phaseId: 'discover', status: 'completed' }, review: { phaseId: 'review', status: 'running' } },
  calls: { one: { status: 'completed' }, two: { status: 'running' } }, usage: { totalTokens: 20000 }, agentRunIds: ['agent-1'], cacheHits: 0,
}
const snapshot = { agents: { 'agent-1': agent }, workflows: { 'workflow-1': workflow } }

const agentLines = new SubagentMessageComponent('agent-1', agent).render(90).join('\n')
assert.match(agentLines, /code-reviewer/)
assert.match(agentLines, /Terra/)
assert.match(agentLines, /12\.3k tokens/)

const workflowLines = new WorkflowMessageComponent('workflow-1', workflow, [agent]).render(90).join('\n')
assert.match(workflowLines, /review-changes/)
assert.match(workflowLines, /1\/3 agents/)
assert.match(workflowLines, /discover ✓/)

const writes = []
const output = { columns: 90, rows: 30, isTTY: true, write: (value) => writes.push(value) }
const host = new ZyraComponentHost({ output })
host.append({ key: 'content', render: () => ['content'] })
const editor = { key: 'editor', render: () => ['editor'], cursorPosition: () => ({ row: 0, col: 6 }), setHost(value) { this.host = value } }
host.setInputComponent(editor)
const dock = new AgentDockComponent({ getSnapshot: () => snapshot, maxRows: 2 })
host.setAuxiliaryComponent('agent-dock', dock)
host.setInteractive(true)
const fixed = host.renderFixedLines(90).join('\n')
assert(fixed.indexOf('Agents') < fixed.indexOf('editor'))
assert.equal(host.focusNextAuxiliary(), true)
assert.equal(host.activeInputComponent(), dock)
await dock.handleKeypress('', { name: 'escape' })
assert.equal(host.activeInputComponent(), editor)
host.dispose()

const actions = []
const controller = {
  snapshot: () => snapshot,
  subscribe: () => () => {},
  stop: async (id) => actions.push(['stop', id]),
  retry: async (id) => actions.push(['retry', id]),
}
const manager = new AgentManagerComponent(controller)
manager.setHost({ invalidate() {} })
assert.match(manager.render(100).join('\n'), /Active 1/)
await manager.handleKeypress('x', { name: 'x' })
assert.deepEqual(actions[0], ['stop', 'agent-1'])
manager.dispose()

const workflowActions = []
const workflowRuntime = {
  listRuns: () => [workflow],
  pause: async (id) => workflowActions.push(['pause', id]),
  resume: async (id) => workflowActions.push(['resume', id]),
  stop: async (id) => workflowActions.push(['stop', id]),
  restart: async (id) => workflowActions.push(['restart', id]),
}
const workflowManager = new WorkflowManagerComponent(workflowRuntime)
workflowManager.setHost({ invalidate() {} })
assert.match(workflowManager.render(90).join('\n'), /review-changes/)
await workflowManager.handleKeypress('p', { name: 'p' })
assert.deepEqual(workflowActions[0], ['pause', 'workflow-1'])

const runtime = {
  fleet: { listDefinitions: () => ({ active: [{ name: 'code-reviewer', definition: { description: 'Review code' } }] }) },
  workflows: { listDefinitions: () => ({ active: [{ definition: { name: 'review-changes', description: 'Review changes' } }] }) },
}
const mentionText = 'Compare @src/auth.mjs with @agent-code'
const mention = getSlashSuggestions(runtime, mentionText)[0]
assert.equal(applySlashSuggestion(mentionText, mention), 'Compare @src/auth.mjs with @agent-code-reviewer')
assert.equal(getSlashSuggestions(runtime, '/agent ')[0].kind, 'agent-definition')
assert.equal(getSlashSuggestions(runtime, '/workflow rev')[0].value, 'review-changes')

console.log('Fleet TUI contract tests passed.')
