import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileVoiceSession } from '../src/voice-session.mjs';
import { HostRouter, isRead } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';
const chat = { canonicalChatId: 'chat', project: '/shared' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  const calls = [], events = [];
  let listener;
  const api = { start: async () => ({ adapterSessionId: 'voice-a', realtimeSessionId: 'realtime-a', realtimeSessionGeneration: 1, sdp: 'v=0 answer' }),
    ingest: async (_id, event) => { calls.push(event.type); }, message: async value => value,
    stop: async () => { calls.push('stop'); }, subscribe: value => { listener = value; return () => { listener = null; }; }, ...overrides };
  return { voice: new MobileVoiceSession(api, event => events.push(event)), calls, events, emit: event => listener?.(event) };
}
const start = voice => voice.dispatch('voice.start', { sdp: 'v=0 offer' }, chat);

test('PC termination carries the exact connection binding to the phone', async () => {
  const { voice, events, emit } = fixture();
  await start(voice);
  emit({ type: 'transcript.done', adapterSessionId: 'old-adapter', providerItemId: 'private-old-item', role: 'assistant', text: 'Old call' });
  emit({ type: 'session.closed', adapterSessionId: 'voice-a', realtimeSessionGeneration: 0 });
  emit({ type: 'transcript.done', adapterSessionId: 'voice-a', realtimeSessionId: 'old-realtime', providerItemId: 'private-old-item', role: 'assistant', text: 'Old generation' });
  assert.deepEqual(events, []);
  emit({ type: 'session.closed', reason: 'selection_changed' });
  assert.deepEqual(events, [{ session: 'chat', event: { type: 'session.closed', reason: 'selection_changed', adapterSessionId: 'voice-a', realtimeSessionId: 'realtime-a', realtimeSessionGeneration: 1 } }]);
  await voice.close();
});

test('typed Voice messages include the PC timestamp required by the canonical committer', async () => {
  const { voice } = fixture(); await start(voice);
  const before = Date.now();
  const result = await voice.dispatch('voice.message', { adapterSessionId: 'voice-a', text: 'hello', clientMessageId: 'phone-message' }, chat);
  assert.equal(result.clientMessageId, 'phone-message'); assert.equal(result.text, 'hello');
  assert.ok(Date.parse(result.clientMessageCreatedAt) >= before && Date.parse(result.clientMessageCreatedAt) <= Date.now());
  await voice.close();
});

test('detaching the owning chat ends Voice before removing its attachment', async () => {
  const { voice, calls } = fixture();
  await voice.dispatch('voice.start', { session: 'attachment', sdp: 'v=0 offer' }, chat);
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(), voice,
    client: { detach: async () => { calls.push('detached'); return {}; } } });
  router.attached.add('other'); router.attached.add('attachment');
  await router.dispatch('session.detach', { sessionKey: 'other' });
  assert.deepEqual(calls, ['detached']);
  await router.dispatch('session.detach', { sessionKey: 'attachment' });
  assert.deepEqual(calls, ['detached', 'stop', 'detached']);
  await start(voice); assert.equal(voice.identity, 'voice-a'); await voice.close();
});

test('voice validates ownership, event sizes and transient command classification', async () => {
  const { voice } = fixture();
  await start(voice);
  await assert.rejects(start(voice));
  await assert.rejects(voice.dispatch('voice.ingest', { adapterSessionId: 'other', events: [{ type: 'test' }] }, chat));
  await assert.rejects(voice.dispatch('voice.stop', {}, { ...chat, canonicalChatId: 'other' }));
  await assert.rejects(voice.dispatch('voice.ingest', { adapterSessionId: 'voice-a', events: [{ type: 'test', text: 'x'.repeat(65536) }] }, chat));
  for (const method of ['voice.start','voice.ingest','voice.stop','voice.message']) assert.equal(isRead(method), true, 'connection-owned signaling bypasses durable receipts');
  await voice.close();
});

test('disconnect during delayed startup cancels and closes the late lease', async () => {
  const ready = deferred(); let signal;
  const { voice, calls, emit, events } = fixture({ start: async (_chat, _input, value) => { signal = value; return ready.promise; } });
  const starting = start(voice); const failed = assert.rejects(starting, /cancelled/);
  await Promise.resolve();
  const closing = voice.close(); assert.equal(signal.aborted, true);
  ready.resolve({ adapterSessionId: 'late', sdp: 'v=0 answer' });
  await failed; await closing;
  emit({ type: 'private.transcript' }); assert.deepEqual(events, []);
  assert.ok(calls.filter(call => call === 'stop').length >= 2);
});

test('event batches stay ordered with a two-batch queue cap', async () => {
  const ready = deferred(); const seen = [];
  const { voice } = fixture({ ingest: async (_id, event) => { seen.push(event.type); if (event.type === 'one') await ready.promise; } });
  await start(voice);
  const batch = types => voice.dispatch('voice.ingest', { adapterSessionId: 'voice-a', events: types.map(type => ({ type })) }, chat);
  const first = batch(['one','two']), second = batch(['three']);
  await assert.rejects(batch(['four']), /quickly/);
  ready.resolve(); await Promise.all([first, second]);
  assert.deepEqual(seen, ['one','two','three']);
  await voice.close();
});

test('hidden and unattached chats are rejected before the voice adapter runs', async () => {
  let calls = 0;
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(),
    voice: { dispatch: async () => { calls++; return {}; } },
    client: { request: async () => ({ chat: { ...chat, project: '/private' } }) } });
  await assert.rejects(router.dispatch('voice.start', { session: 'chat', sdp: 'v=0' }));
  router.attached.add('chat');
  await assert.rejects(router.dispatch('voice.start', { session: 'chat', sdp: 'v=0' }));
  assert.equal(calls, 0);
});
