import assert from 'node:assert/strict'
import { ChromePairingServer } from '../src/main/agent-control/chrome-pairing-server'
const pairing = new ChromePairingServer()
const extensionId = 'a'.repeat(32)
const events: unknown[] = []
pairing.on('extension-event', event => events.push(event))
const request = async (session: Awaited<ReturnType<typeof pairing.connectExtension>>, route: string, body: object = {}) => {
    const response = await fetch(`http://127.0.0.1:${session.port}${route}`, { method:'POST', headers:{Origin:`chrome-extension://${extensionId}`, Authorization:`Bearer ${session.token}`, 'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const payload = await response.json() as {nextToken?:string}
    if (payload.nextToken) session.token = payload.nextToken
    return response.status
}
try {
    const one = await pairing.connectExtension(extensionId, 'browser_instance_one')
    const two = await pairing.connectExtension(extensionId, 'browser_instance_two')
    assert.notEqual(one.pairId, two.pairId)
    assert.equal(one.port, two.port)
    assert.equal(await request(one, '/v1/poll'), 200)
    assert.equal(await request(two, '/v1/poll'), 200, 'same extension in another profile must retain its own connection')
    const replacement = await pairing.connectExtension(extensionId, 'browser_instance_one')
    assert.equal(await request(one, '/v1/poll'), 403, 'reconnection invalidates the previous session')
    assert.equal(await request(two, '/v1/poll'), 200, 'reconnection leaves other profiles intact')
    assert.equal(await request(replacement, '/v1/event', {type:'session.disconnect'}), 200)
    assert.equal(await request(two, '/v1/poll'), 200)
    await pairing.stop('emergency-stop')
    assert.equal(pairing.state().automaticConnectionPaused, true)
    await assert.rejects(pairing.connectExtension(extensionId, 'browser_instance_one'), /paused/)
    await pairing.start()
    assert.equal(pairing.state().automaticConnectionPaused, false)
    await pairing.connectExtension(extensionId, 'browser_instance_one')
    assert.ok(events.length >= 2)
    pairing.sweepInactiveSessions(Date.now() + 21000)
    assert.equal(pairing.state().state, 'stopped', 'closing or uninstalling Chrome clears connected status promptly')
    await pairing.connectExtension(extensionId, 'browser_instance_one')
    assert.equal(pairing.state().state, 'paired', 'offline browsers can reconnect without a code')
    console.log('Automatic Chrome connection: multiple profiles, reconnect, token rotation and stop: ok')
} finally { await pairing.stop() }
