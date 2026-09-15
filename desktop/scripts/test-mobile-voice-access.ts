import assert from 'node:assert/strict'
import { MobileVoiceAccess } from '../src/main/mobile-voice-access'
import type { AssistantService } from '../src/main/assistant/service'

const listeners = new Set<(event: any, owner: number | null) => void>()
let owner: number | null = null
const owners: number[] = [], stopped: number[] = []
const service = {
    ownsRealtimeVoice: (id: number) => owner === id,
    subscribeExternalRealtimeVoiceEvents: (listener: (event: any, owner: number | null) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    startMobileRealtimeVoice: async (_session: string, _input: unknown, id: number) => {
        assert.equal(owner, null, 'only one owner can use the PC voice runtime')
        owner = id; owners.push(id); return { adapterSessionId: `voice:${id}`, sdp: 'v=0 answer' }
    },
    stopRealtimeVoice: async (id: number) => { assert.equal(owner, id); stopped.push(id); owner = null },
    ingestRealtimeVoiceEvent: async () => ({}), sendRealtimeVoiceMessage: async () => ({})
} as unknown as AssistantService
const eventsA: unknown[] = [], eventsB: unknown[] = []
const a = new MobileVoiceAccess(service, event => eventsA.push(event))
const b = new MobileVoiceAccess(service, event => eventsB.push(event))
const chat = { canonicalChatId: 'chat' }
await a.dispatch('voice.start', { sdp: 'v=0 offer' }, chat)
await assert.rejects(b.dispatch('voice.start', { sdp: 'v=0 offer' }, chat))
for (const listener of listeners) listener({ type: 'transcript.done', text: 'Owner A only' }, owner)
assert.equal(eventsA.length, 1); assert.equal(eventsB.length, 0)
await a.close()
await b.dispatch('voice.start', { sdp: 'v=0 offer' }, chat)
await a.close()
assert.equal(owner, owners[1], 'late close from A must leave B running')
for (const listener of listeners) listener({ type: 'transcript.done', text: 'Owner B only' }, owner)
assert.equal(eventsA.length, 1); assert.equal(eventsB.length, 1)
assert.notEqual(owners[0], owners[1]); assert.ok(owners.every(id => id < -2_000_000_000))
// Desktop clears ownership before broadcasting its final call event.
const endedOwner = owner; owner = null
for (const listener of listeners) listener({ type: 'session.closed', reason: 'ended' }, endedOwner)
assert.equal(eventsB.length, 2)
for (const listener of listeners) listener({ type: 'session.closed', reason: 'another client' }, 42)
assert.equal(eventsB.length, 2)
owner = endedOwner
await b.close(); assert.deepEqual(stopped, owners); assert.equal(listeners.size, 0)
console.log('Mobile voice ownership, private event routing and late-close isolation passed')
