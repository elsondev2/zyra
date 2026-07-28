import assert from 'node:assert/strict'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { assertActionAllowed } from '../src/main/agent-control/capability-policy'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'

const driver = new FakeControlDriver('zyra-browser')
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId, tabId: 'browser:test', ownerThreadId: 'thread:test', guestIdentity: 'guest:test', origin: 'http://127.0.0.1' },
    driver,
    trustedIdentity: {}
})
const principal = { type: 'root' as const, threadId: 'thread:test', turnId: 'turn:test' }
const blankTargetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId: blankTargetId, tabId: 'browser:blank', ownerThreadId: 'thread:test', guestIdentity: 'guest:blank', origin: null },
    driver,
    trustedIdentity: {}
})
assert.throws(() => broker.requestGrant({
    principal, targetId: blankTargetId, capabilities: ['tab.manage'], maxActions: 2
}), /explicit HTTP\(S\) origin scope/, 'blank tabs cannot become origin-free external browser launchers')
const approvalRaceTargetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId: approvalRaceTargetId, tabId: 'browser:approval-race', ownerThreadId: 'thread:test', guestIdentity: 'guest:approval-race', origin: 'https://allowed.example' },
    driver,
    trustedIdentity: {}
})
const approvalRacePending = broker.requestGrant({
    principal, targetId: approvalRaceTargetId, capabilities: ['observe.structure'], maxActions: 2,
    allowedOrigins: ['https://allowed.example']
})
broker.handleTargetNavigation(approvalRaceTargetId, 'https://outside.example/')
assert.throws(() => broker.approvePendingGrant({
    pendingRequestId: approvalRacePending.requestId,
    targetId: approvalRaceTargetId,
    capabilities: approvalRacePending.capabilities,
    durationMs: 30_000,
    maxActions: 2,
    allowedOrigins: approvalRacePending.allowedOrigins
}), /outside the grant scope/, 'approval cannot leave an active grant behind after the target changes origin')
assert.equal(broker.grants.list().some((entry) => entry.targetId === approvalRaceTargetId && entry.state === 'active'), false)
assert.equal(broker.grants.getPending(approvalRacePending.requestId), undefined)
const pending = broker.requestGrant({
    principal, targetId,
    capabilities: ['observe.structure', 'pointer.click', 'keyboard.type', 'navigate'],
    durationMs: 60_000,
    maxActions: 10,
    allowedOrigins: ['http://127.0.0.1']
})
assert.throws(() => broker.approvePendingGrant({
    pendingRequestId: pending.requestId, targetId,
    capabilities: ['observe.structure', 'pointer.click', 'keyboard.type', 'navigate', 'keyboard.key'],
    durationMs: 60_000, maxActions: 10
}), /cannot widen/)
const grant = broker.approvePendingGrant({
    pendingRequestId: pending.requestId, targetId,
    capabilities: pending.capabilities,
    durationMs: 30_000, maxActions: 5,
    allowedOrigins: pending.allowedOrigins
})
assert.equal(grant.state, 'active')
assert.throws(() => assertActionAllowed(
    { ...grant, capabilities: ['keyboard.type'] },
    broker.targets.get(targetId).target,
    { type: 'type', x: 320, y: 220, text: 'Canvas text' }
), /also requires pointer\.click/)
const observation = await broker.observe(principal, grant.grantId, targetId)
assert.equal(observation.elements.find((element) => element.role === 'password')?.value, '[REDACTED]')
await assert.rejects(() => broker.act(principal, {
    version: 1, requestId: 'request:secret-field', grantId: grant.grantId, targetId,
    observationRevision: observation.revision,
    action: { type: 'type', elementRef: 'fixture:password', text: 'model-supplied-value' }
}), /cannot type into a password or sensitive field/)
await assert.rejects(() => broker.act(principal, {
    version: 1, requestId: 'request:outside', grantId: grant.grantId, targetId,
    observationRevision: observation.revision,
    action: { type: 'navigate', url: 'https://outside.example/' }
}), /outside the grant origin scope/)
await assert.rejects(() => broker.act(principal, {
    version: 1, requestId: 'request:side-effect', grantId: grant.grantId, targetId,
    observationRevision: observation.revision,
    action: { type: 'click', elementRef: 'fixture:button', sideEffect: 'purchase' }
}), /requires explicit per-action user approval/)
await assert.rejects(() => broker.act(principal, {
    version: 1, requestId: 'request:outside-type', grantId: grant.grantId, targetId,
    observationRevision: observation.revision,
    action: { type: 'type', x: 100_000, y: 220, text: 'outside viewport' }
}), /outside the latest observed viewport/)
const focusedTypeResult = await broker.act(principal, {
    version: 1, requestId: 'request:focused-type', grantId: grant.grantId, targetId,
    observationRevision: observation.revision,
    action: { type: 'type', text: 'Canvas text' }
})
assert.equal(focusedTypeResult.changed, true)

const child = { type: 'agent' as const, fleetId: 'fleet:test', agentRunId: 'agent:test', parentThreadId: principal.threadId }
assert.throws(() => broker.delegate({
    parentGrantId: grant.grantId, parentPrincipal: principal, childPrincipal: child, targetId,
    capabilities: grant.capabilities, expiresAt: grant.expiresAt, maxActions: grant.maxActions - grant.actionCount,
    allowedOrigins: grant.allowedOrigins
}), /must attenuate/)
const lease = broker.delegate({
    parentGrantId: grant.grantId, parentPrincipal: principal, childPrincipal: child, targetId,
    capabilities: ['observe.structure'], expiresAt: new Date(Date.now() + 10_000).toISOString(), maxActions: 1,
    allowedOrigins: ['http://127.0.0.1']
})
assert.equal(lease.parentGrantId, grant.grantId)
broker.revokeGrant(grant.grantId)
assert.equal(broker.grants.list().find((entry) => entry.grantId === lease.grantId)?.state, 'revoked')
console.log('Agent control policy and attenuation passed.')
