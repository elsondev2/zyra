import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FleetEventStore } from '../src/agents/event-store.mjs'
import { evaluateWorkflowApproval } from '../src/workflows/approval.mjs'
import { createWorkflowCallFingerprint, WorkflowCache } from '../src/workflows/cache.mjs'
import { extractWorkflowMeta } from '../src/workflows/compiler.mjs'
import { discoverWorkflowDefinitions } from '../src/workflows/loader.mjs'
import { WorkflowRuntime } from '../src/workflows/runtime.mjs'
import { WorkflowSandboxHost } from '../src/workflows/sandbox-host.mjs'
import { WorkflowScheduler } from '../src/workflows/scheduler.mjs'
import { validateWorkflowSource } from '../src/workflows/validator.mjs'

const tests = []
function test(name, run) { tests.push({ name, run }) }

const route = { requested: 'terra', selectedKey: 'openai-codex/gpt-5.6-terra', selectedTier: 'terra', selectedModel: { provider: 'openai-codex', id: 'gpt-5.6-terra' }, fallback: false }

test('workflow validation rejects Node, network, dynamic evaluation, and nondeterminism', () => {
  for (const source of [
    'export default process.env.SECRET',
    'export default await fetch("https://example.com")',
    'export default eval("1 + 1")',
    'export default Date.now()',
    'export default await import("node:fs")',
  ]) assert.equal(validateWorkflowSource(source).valid, false, source)
  assert.equal(validateWorkflowSource('export default await agent("inspect", { tools: ["read"] })').valid, true)
})

test('QuickJS sandbox is deterministic and only crosses the explicit phase/agent bridge', async () => {
  const seen = []
  const sandbox = new WorkflowSandboxHost({ timeoutMs: 4000, cpuTimeoutMs: 500 })
  const result = await sandbox.execute({
    source: `export const meta = { name: "deterministic" };\nconst values = await phase("fanout", () => pipeline([1, 2, 3], (value) => agent("item-" + value, { key: "k-" + value }), { concurrency: 2 }));\nexport default values;`,
    args: {}, projectedCalls: 3,
    onRequest: async (operation, request) => { seen.push([operation, request.name ?? request.prompt]); return operation === 'agent' ? request.prompt : { ok: true } },
  })
  assert.deepEqual(result, ['item-1', 'item-2', 'item-3'])
  assert(seen.some(([operation, name]) => operation === 'phase' && name === 'fanout'))
  assert.equal(seen.filter(([operation]) => operation === 'agent').length, 3)
})

test('sandbox cancellation terminates owned execution without leaving a live worker', async () => {
  const sandbox = new WorkflowSandboxHost({ timeoutMs: 5000 })
  const abort = new AbortController()
  const execution = sandbox.execute({
    source: 'export default await agent("wait forever")', projectedCalls: 1, signal: abort.signal,
    onRequest: () => new Promise(() => {}),
  })
  setTimeout(() => abort.abort('test stop'), 50)
  await assert.rejects(execution, /Workflow cancelled/)
  assert.equal(sandbox.child, null)
})

test('metadata extraction preserves explicit calls, request, token, cost, and concurrency budgets', async () => {
  const source = 'export const meta = { name: "budgeted", budgets: { maxCalls: 7, maxRequests: 8, maxTokens: 9000, maxCostUsd: 1.25, maxConcurrency: 2 } }; export default await agent("x");'
  assert.deepEqual(extractWorkflowMeta(source).budgets, { maxCalls: 7, maxRequests: 8, maxTokens: 9000, maxCostUsd: 1.25, maxConcurrency: 2 })
  const definitions = await discoverWorkflowDefinitions({ installRoot: path.resolve('.'), project: await mkdtemp(path.join(os.tmpdir(), 'zyra-workflow-discovery-')) })
  const builtIn = definitions.active.find((entry) => entry.definition.name === 'review-changes')
  assert.equal(builtIn.definition.budgets.maxCalls, 24)
  assert.equal(builtIn.definition.budgets.maxConcurrency, 3)
})

test('temporary and untrusted project workflows require an explicit one-run approval', () => {
  const generated = evaluateWorkflowApproval({ origin: 'temporary', temporary: true, trusted: false })
  assert.equal(generated.required, true)
  assert.equal(generated.approved, false)
  assert.equal(evaluateWorkflowApproval({ origin: 'temporary', temporary: true, trusted: false }, { approved: true }).approved, true)
  const project = evaluateWorkflowApproval({ origin: 'project', trusted: false }, { projectTrusted: false })
  assert.equal(project.required, true)
  assert(project.warnings.some((warning) => warning.includes('project trust')))
  assert.equal(evaluateWorkflowApproval({ origin: 'built-in', trusted: true }).required, false)
})

test('workflow cache fingerprints include policy and return only completed matching records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-workflow-cache-'))
  const left = createWorkflowCallFingerprint({ scriptHash: 'a', args: { n: 1 }, prompt: 'review', selectedModelPolicy: { requested: 'terra' }, tools: ['read'] })
  const right = createWorkflowCallFingerprint({ scriptHash: 'a', args: { n: 1 }, prompt: 'review', selectedModelPolicy: { requested: 'sol' }, tools: ['read'] })
  assert.notEqual(left, right)
  const cache = new WorkflowCache(directory)
  assert.equal(await cache.get(left), null)
  await cache.put(left, { finding: 'x' })
  assert.deepEqual((await cache.get(left)).value, { finding: 'x' })
  await rm(directory, { recursive: true, force: true })
})

test('scheduler enforces max concurrency, caches stable calls, and stops after token/cost budgets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-workflow-scheduler-'))
  let active = 0
  let maxActive = 0
  let spawns = 0
  const controller = {
    previewRoute: () => route,
    listDefinitions: () => ({ active: [] }),
    modelRouter: { escalate: () => route },
    async spawn(request) {
      spawns += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 30))
      active -= 1
      return { agentRunId: `agent-${spawns}`, selectedModel: route.selectedKey, modelRoute: route, usage: { totalTokens: 20, cost: 0.3 }, result: { text: request.prompt } }
    },
  }
  const events = []
  const eventStore = { append: async (type, payload, refs) => { events.push({ type, payload, refs }) } }
  const scheduler = new WorkflowScheduler({ controller, eventStore, workflowRunId: 'wf-1', definition: { scriptHash: 'script' }, args: {}, budget: { maxCalls: 10, maxRequests: 10, maxTokens: 100, maxCostUsd: 2, maxConcurrency: 2 }, cacheDirectory: path.join(directory, 'cache') })
  await Promise.all([1, 2, 3].map((value) => scheduler.handle('agent', { prompt: `p-${value}`, options: { key: `k-${value}` } })))
  assert.equal(maxActive, 2)
  const cachedFirst = await scheduler.handle('agent', { prompt: 'cache-me', options: { key: 'same' } })
  const spawnCount = spawns
  const cachedSecond = await scheduler.handle('agent', { prompt: 'cache-me', options: { key: 'same' } })
  assert.equal(cachedFirst, cachedSecond)
  assert.equal(spawns, spawnCount)
  assert(events.some((entry) => entry.payload.status === 'cached'))

  const costScheduler = new WorkflowScheduler({ controller, eventStore, workflowRunId: 'wf-cost', definition: { scriptHash: 'script-cost' }, args: {}, budget: { maxCalls: 10, maxRequests: 10, maxTokens: 100, maxCostUsd: 0.25, maxConcurrency: 1 }, cacheDirectory: path.join(directory, 'cost') })
  await costScheduler.handle('agent', { prompt: 'first', options: { key: 'first' } })
  await assert.rejects(costScheduler.handle('agent', { prompt: 'second', options: { key: 'second' } }), /cost budget exhausted/)
  await rm(directory, { recursive: true, force: true })
})

test('built-in review workflow runs end-to-end through event sourcing and preserves child links', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'zyra-workflow-runtime-'))
  const eventStore = new FleetEventStore({ project, rootSessionId: 'root-workflow', rootThreadId: 'thread-workflow', fleetId: 'fleet-workflow' })
  await eventStore.initialize({ fleetId: 'fleet-workflow' })
  const notifications = []
  eventStore.subscribe(({ event }) => notifications.push(event.type))
  let sequence = 0
  const controller = {
    fleetId: 'fleet-workflow', rootThreadId: 'thread-workflow', eventStore,
    snapshot: () => eventStore.getSnapshot(), previewRoute: () => route,
    listDefinitions: () => ({ active: [{ name: 'code-reviewer', definition: { version: 1 } }] }),
    modelRouter: { escalate: () => route },
    async spawn(request) {
      sequence += 1
      const discover = request.prompt.includes('changed source files')
      return {
        agentRunId: `child-${sequence}`, selectedModel: route.selectedKey, modelRoute: route,
        usage: { totalTokens: 11, cost: 0.01 },
        result: discover ? { structured: { files: ['src/a.mjs', 'src/b.mjs'] }, text: '{"files":["src/a.mjs","src/b.mjs"]}' } : { text: `checked-${sequence}` },
      }
    },
  }
  const runtime = new WorkflowRuntime({ controller, eventStore, project, installRoot: path.resolve('.'), projectTrusted: true })
  await runtime.initialize()
  const run = await runtime.run('review-changes', {}, { background: false })
  assert.equal(run.status, 'completed')
  assert.equal(run.agentRunIds.length, 6)
  assert.equal(Object.values(run.calls).filter((call) => call.status === 'completed').length, 6)
  assert.equal(run.usage.requests, 6)
  assert.equal(run.phases.discover.status, 'completed')
  assert.equal(run.phases.synthesize.status, 'completed')
  assert.equal(new Set(eventStore.getSnapshot().workflows[run.workflowRunId].agentRunIds).size, 6)
  assert(notifications.includes('workflow.completed'))
  await runtime.dispose()
  await eventStore.flush()
  await rm(project, { recursive: true, force: true })
})

let passed = 0
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}`); throw error }
}
console.log(`Workflow contract tests passed (${passed}/${tests.length}).`)
