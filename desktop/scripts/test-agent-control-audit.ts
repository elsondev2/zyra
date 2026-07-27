import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AuditStore } from '../src/main/agent-control/audit-store'
import { redactControlUrl, redactObservation } from '../src/main/agent-control/redaction'

const directory = mkdtempSync(path.join(tmpdir(), 'zyra-agent-control-'))
const store = new AuditStore(directory)
store.append({
    eventType: 'action', outcome: 'completed', actionType: 'type',
    origin: 'https://example.test/callback?code=secret&state=secret#token',
    message: 'password=never-log-this', redactions: []
})
const event = store.list()[0]
assert.doesNotMatch(JSON.stringify(event), /never-log-this|code=secret|state=secret|#token/)
const persisted = readFileSync(path.join(directory, 'agent-control', 'audit-v1.json'), 'utf8')
assert.doesNotMatch(persisted, /never-log-this|code=secret|state=secret/)
assert.equal(redactControlUrl('https://example.test/path?token=abc#fragment')?.includes('abc'), false)
const observation = redactObservation({
    version: 1, observationId: 'observation:test', revision: 1, targetId: 'target:test',
    capturedAt: new Date().toISOString(), targetState: 'ready', elements: [
        { elementRef: 'element:test', role: 'password', name: 'Password', value: 'secret', sensitive: true }
    ], redactions: []
})
assert.equal(observation.elements[0].value, '[REDACTED]')
store.clear()
assert.equal(store.list().length, 0)
console.log('Agent control audit retention and redaction passed.')
