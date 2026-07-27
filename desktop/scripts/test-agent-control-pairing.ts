import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { ChromePairingServer } from '../src/main/agent-control/chrome-pairing-server'

const server = new ChromePairingServer()
const state = await server.start()
assert.equal(state.state, 'waiting')
const extensionId = 'a'.repeat(32)
const origin = `chrome-extension://${extensionId}`
const nonce = 'nonce_nonce_nonce_1234567890'
const hello = await post('/v1/pair/hello', { protocolVersion: 1, extensionId, nonce, code: state.code }, origin)
assert.equal(hello.status, 200)
const proof = createHmac('sha256', state.code!).update(`${nonce}:${hello.body.challenge}`).digest('base64url')
const paired = await post('/v1/pair/prove', { protocolVersion: 1, sessionId: hello.body.sessionId, proof }, origin)
assert.equal(paired.status, 200)
const token = paired.body.token
const firstPoll = await post('/v1/poll', {}, origin, token)
assert.equal(firstPoll.status, 200)
assert.ok(firstPoll.body.nextToken)
const replay = await post('/v1/poll', {}, origin, token)
assert.equal(replay.status, 403)
const forgedOrigin = await post('/v1/poll', {}, `https://example.test`, firstPoll.body.nextToken)
assert.equal(forgedOrigin.status, 403)
const eventPromise = new Promise<any>((resolve) => server.once('extension-event', resolve))
const tabEvent = await post('/v1/event', {
    type: 'tab.register', tabId: 42, documentId: 'document:test', url: 'https://example.test/', title: 'Fixture'
}, origin, firstPoll.body.nextToken)
assert.equal(tabEvent.status, 200)
const event = await eventPromise
assert.equal(event.tabId, 42)
assert.equal(event.extensionId, extensionId)
await server.stop('test-complete')
assert.equal(server.state().state, 'stopped')
console.log('Chrome loopback pairing origin, proof, rotation, replay, and exact-tab event checks passed.')

async function post(pathname: string, body: unknown, origin: string, token?: string) {
    const response = await fetch(`http://127.0.0.1:${state.port}${pathname}`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
    })
    return { status: response.status, body: await response.json() as any }
}
