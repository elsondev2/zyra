import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentFleetController } from '../src/agents/runtime/fleet-controller.mjs'

const project = await mkdtemp(path.join(os.tmpdir(), 'zyra-fleet-cancel-'))
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const started = defer()
const cleanup = defer()
const runs = []
const controller = new AgentFleetController({
  project, rootSessionId: 'root', fleetId: 'fleet', maxSessions: 2,
  modelCatalog: [{ key: 'fixture/model', provider: 'fixture', id: 'model', model: { provider: 'fixture', id: 'model' }, eligible: true, authenticated: true, availability: 'available', rejectionReasons: [], reasoning: true, toolUse: true, contextWindow: 100000 }],
  runner: { async run(run, { signal }) {
    signal.throwIfAborted()
    runs.push(run.goal)
    if (run.goal === 'active') {
      started.resolve()
      await new Promise((resolve, reject) => signal.addEventListener('abort', async () => {
        await cleanup.promise
        const error = new Error('cancelled'); error.name = 'AbortError'; reject(error)
      }, { once: true }))
    }
    return { host: { dispose() {} }, text: run.goal, usage: {} }
  } }
})
const spawn = goal => controller.spawn({ prompt: goal, model: 'fixture/model', background: true })
try {
  await controller.initialize({ installRoot: project })
  const active = await spawn('active')
  await started.promise
  const queued = await spawn('queued')
  const originalEmit = controller.emit.bind(controller)
  const creating = defer(); const releaseCreate = defer()
  controller.emit = async (...args) => {
    if (args[0] === 'agent.created' && args[1].agent.goal === 'inflight') {
      creating.resolve(); await releaseCreate.promise
    }
    return originalEmit(...args)
  }
  let lockAcquires = 0
  controller.workspaceGuard.acquire = async () => { lockAcquires += 1; return { release() {} } }
  const inflight = controller.spawn({ prompt: 'inflight', model: 'fixture/model', background: true, permissionMode: 'writer', writeScope: ['src'] })
  await creating.promise
  const cancellation = controller.cancelAll('root turn aborted')
  await cancellation
  // The blocked agent.created now resumes after cancelAll has settled.
  const next = await spawn('next-turn')
  releaseCreate.resolve(); cleanup.resolve()
  const late = await inflight
  assert.equal((await controller.wait(active.agentRunId)).status, 'cancelled')
  assert.equal((await controller.wait(queued.agentRunId)).status, 'cancelled')
  assert.equal((await controller.wait(late.agentRunId)).status, 'cancelled', 'inflight spawn belongs to the cancelled turn')
  assert.equal((await controller.wait(next.agentRunId)).status, 'completed', 'cancelling an old turn must not poison a new child')
  assert.deepEqual(runs, ['active', 'next-turn'], 'old queued and inflight children cannot execute model work')
  assert.equal(lockAcquires, 0, 'a late cancelled writer must not acquire a workspace lock')
  await controller.cancelAll('second stop')
  const again = await spawn('after-second-stop')
  assert.equal((await controller.wait(again.agentRunId)).status, 'completed')
  for (let index = 0; index < 24; index++) await controller.cancelAll(`repeat stop ${index}`)
  assert.equal(controller.cancellation.nodes.size, 1, 'repeated cancellation retains only the fresh root')
  await controller.dispose()
  await assert.rejects(spawn('disposed'), /disposed/)
  console.log('PASS fleet cancellation preserves late-spawn aborts, new turns, and bounded root nodes')
} finally {
  cleanup.resolve()
  await controller.dispose()
  await rm(project, { recursive: true, force: true })
}
