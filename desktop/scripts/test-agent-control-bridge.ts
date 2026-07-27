import assert from 'node:assert/strict'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'

const driver = new FakeControlDriver()
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({ target: { kind: 'zyra-browser', targetId, tabId: 'browser:test', guestIdentity: 'guest:test', origin: 'http://127.0.0.1' }, driver, trustedIdentity: {} })
const principal = { type: 'root' as const, threadId: 'thread:test', turnId: 'turn:test' }
const listed = await broker.handleToolOperation(principal, { operation: 'list_targets', targetKind: 'zyra-browser' })
assert.equal((listed.targets as unknown[]).length, 1)
const request = await broker.handleToolOperation(principal, {
    operation: 'request_grant', targetId, capabilities: ['observe.structure'], durationMs: 30_000, maxActions: 2
}) as any
assert.equal(request.pending, true)
const pending = request.request
const grant = broker.approvePendingGrant({ pendingRequestId: pending.requestId, targetId, capabilities: pending.capabilities, durationMs: 30_000, maxActions: 2 })
const observed = await broker.handleToolOperation(principal, { operation: 'observe', grantId: grant.grantId, targetId }) as any
assert.equal(observed.observation.targetId, targetId)
await assert.rejects(() => broker.handleToolOperation({ ...principal, turnId: 'turn:forged' }, { operation: 'observe', grantId: grant.grantId, targetId }), /another principal/)
await assert.rejects(() => broker.handleToolOperation(principal, { operation: 'raw_cdp' }), (error: any) => error.code === 'CONTROL_UNKNOWN_OPERATION')
console.log('Agent control bounded bridge operations passed.')
