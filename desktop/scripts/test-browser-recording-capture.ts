import assert from 'node:assert/strict'
import { createBrowserRecordingCaptureBroker, resolveBrowserRecordingController } from '../src/main/browser-recording-capture'
let now = 1
let handler: any
const fakeSession = { setDisplayMediaRequestHandler: (value: unknown) => { handler = value } }
const frame = {}; const guestFrame = {}
const owner = { id: 1, mainFrame: frame, session: fakeSession, isDestroyed: () => false } as any
let destroyed = false
const guest = { id: 2, mainFrame: guestFrame, isDestroyed: () => destroyed } as any
const broker = createBrowserRecordingCaptureBroker('win32', () => now)
const request = (requestFrame: unknown, audioRequested = false) => {
    let result: any
    handler({ frame: requestFrame, videoRequested: true, audioRequested }, (streams: unknown) => { result = streams })
    return result
}
broker.arm(owner, guest, 'off')
assert.equal(broker.hasGrant(owner), true)
assert.deepEqual(request({}), {}, 'unrelated windows and subframes cannot capture')
assert.equal(broker.hasGrant(owner), true, 'an invalid caller cannot consume the owner grant')
assert.deepEqual(request(frame, true), {}, 'video-only grants cannot acquire audio')
assert.deepEqual(request(frame), { video: guestFrame })
assert.equal(broker.hasGrant(owner), false, 'capture grants are single use')
assert.equal(broker.hasRecording(owner), true, 'the owner retains audio-only microphone access during recording')
assert.deepEqual(request(frame), {})
broker.arm(owner, guest, 'tab')
assert.deepEqual(request(frame, true), { video: guestFrame, audio: guestFrame, enableLocalEcho: true }, 'tab capture leaves speaker playback enabled')
broker.arm(owner, guest, 'system')
assert.deepEqual(request(frame, true), { video: guestFrame, audio: 'loopback' })
broker.arm(owner, guest, 'off'); now += 10001
assert.equal(broker.hasGrant(owner), false); assert.deepEqual(request(frame), {}, 'expired grants cannot capture')
broker.arm(owner, guest, 'off'); destroyed = true
assert.equal(broker.hasGrant(owner), false); assert.deepEqual(request(frame), {}, 'closed guests cannot be captured')
destroyed = false; broker.arm(owner, guest, 'off'); broker.cancel(owner.id)
assert.deepEqual(request(frame), {}, 'stopping revokes outstanding display capture')
assert.equal(broker.hasRecording(owner), false, 'stopping revokes detached owner microphone access')
const otherPlatform = createBrowserRecordingCaptureBroker('linux')
assert.throws(() => otherPlatform.arm(owner, guest, 'system'), /supported on Windows/)
console.log('Native recording ownership, audio scope and one-use grants: ok')

const target = { guestWebContentsId: guest.id, tabId: 'tab:captured' }
const recording = { ownerWebContentsId: owner.id, ownerFrame: frame, guest, tabId: target.tabId }
Object.assign(guest, { currentWindowOwner: 99 })
assert.equal(resolveBrowserRecordingController(recording, owner.id, frame, target), recording,
    'audio and Stop remain controlled by the original renderer after the guest changes windows')
assert.throws(() => resolveBrowserRecordingController(recording, 99, {}, target), /does not own/,
    'the new guest owner cannot take over an existing recording')
assert.throws(() => resolveBrowserRecordingController(recording, owner.id, {}, target), /does not own/,
    'a replaced renderer frame cannot inherit recording control')
assert.throws(() => resolveBrowserRecordingController(recording, owner.id, frame, { ...target, tabId: 'tab:other' }), /does not own/)
assert.throws(() => resolveBrowserRecordingController(recording, owner.id, frame, { ...target, guestWebContentsId: 123 }), /does not own/)
console.log('Recording control survives guest transfer and stays with its original renderer: ok')
