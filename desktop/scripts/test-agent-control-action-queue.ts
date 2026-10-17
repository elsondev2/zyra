import assert from 'node:assert/strict'
import { ActionQueue } from '../src/main/agent-control/action-queue'
import { CONTROL_BOUNDS } from '../src/shared/agent-control/policy'

const queue = new ActionQueue()
let release!: () => void
const gate = new Promise<void>(resolve => { release = resolve })
let effects = 0
const running = queue.enqueue('native-focus', () => gate)
const controllers = Array.from({ length: CONTROL_BOUNDS.maxPendingActionsPerTarget }, () => new AbortController())
const pending = controllers.map(controller => assert.rejects(queue.enqueue('native-focus', async () => { effects++ }, controller.signal), { code: 'CONTROL_CANCELLED' }))
for (const controller of controllers) controller.abort()
await Promise.all(pending)
assert.equal(effects, 0, 'cancelled entries settle without entering the blocked lane')
const fresh = queue.enqueue('native-focus', async () => { effects++ })
assert.equal(effects, 0, 'cancellation frees queue capacity without letting fresh work overlap the running entry')
release()
await Promise.all([running, fresh])
assert.equal(effects, 1)
const aborted = new AbortController()
aborted.abort()
await assert.rejects(queue.enqueue('native-focus', async () => { effects++ }, aborted.signal), { code: 'CONTROL_CANCELLED' })
assert.equal(effects, 1)
console.log('Action queue: prompt abort removal, bounded capacity recovery, serialization and pre-aborted denial: ok')
