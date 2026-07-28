import assert from 'node:assert/strict'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'

const driver = new FakeControlDriver()
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({ target: { kind: 'zyra-browser', targetId, tabId: 'browser:test', ownerThreadId: 'thread:test', guestIdentity: 'guest:test', origin: 'http://127.0.0.1' }, driver, trustedIdentity: {} })
const principal = { type: 'root' as const, threadId: 'thread:test', turnId: 'turn:test' }
const pending = broker.requestGrant({ principal, targetId, capabilities: ['observe.structure', 'pointer.click'], maxActions: 10 })
const grant = broker.approvePendingGrant({ pendingRequestId: pending.requestId, targetId, capabilities: pending.capabilities, durationMs: 60_000, maxActions: 10 })
const first = await broker.observe(principal, grant.grantId, targetId)
const result = await broker.act(principal, {
    version: 1, requestId: 'request:first', grantId: grant.grantId, targetId,
    observationRevision: first.revision, action: { type: 'click', elementRef: 'fixture:button' }
})
assert.equal(result.observation.revision, first.revision + 1)
await assert.rejects(() => broker.act(principal, {
    version: 1, requestId: 'request:stale', grantId: grant.grantId, targetId,
    observationRevision: first.revision, action: { type: 'click', elementRef: 'fixture:button' }
}), (error: any) => error.code === 'CONTROL_STALE_OBSERVATION' && error.options.freshRevision === result.observation.revision)
broker.handleTargetNavigation(targetId, 'https://outside.example/')
assert.equal(broker.observations.currentRevision(targetId), result.observation.revision + 1)
await broker.emergencyStop()
assert.equal(broker.state().active, false)
assert.equal(broker.observations.get(targetId), undefined)
console.log('Agent control revisions and emergency stop passed.')
