import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { VoiceRecovery } from '../src/voice-recovery.mjs';
import { MobileVoiceSession } from '../src/voice-session.mjs';
import { isRead } from '../src/router.mjs';

const audio = () => readFileSync(new URL('../../android/app/src/test/resources/recovered-voice.wav', import.meta.url));
function params(id = 'one') { const wav = audio(); return { recoveryId: id, providerItemId: 'spoken', bytes: wav.length, durationMs: 2000, sha256: createHash('sha256').update(wav).digest('hex') }; }
function send(recovery, id = 'one') { const wav = audio(); for (let offset = 0; offset < wav.length; offset += 49152) recovery.chunk({ recoveryId: id, offset, data: wav.subarray(offset, offset + 49152).toString('base64') }); }

test('recovery accepts ordered checksummed chunks, erases them and remains transient', async () => {
  let input;
  const recovery = new VoiceRecovery(async value => { input = value; return 'Recovered words'; });
  try {
    recovery.begin(params()); const buffer = recovery.upload.buffer;
    assert.throws(() => recovery.chunk({ recoveryId: 'one', offset: 1, data: 'AA==' }), /order/);
    await assert.rejects(recovery.finish({ recoveryId: 'one' }));
    send(recovery);
    const result = await recovery.finish({ recoveryId: 'one' });
    assert.deepEqual(result, { providerItemId: 'spoken', text: 'Recovered words' });
    assert.deepEqual(Buffer.from(input.audioBase64, 'base64'), audio());
    assert.equal(input.sampleRateHz, 24000); assert.equal(input.mimeType, 'audio/wav'); assert.equal(input.durationMs, 2000);
    assert.equal(buffer.every(value => value === 0), true); assert.equal(recovery.upload, null);
    for (const action of ['begin', 'chunk', 'finish', 'cancel']) assert.equal(isRead('voice.recovery.' + action), true);
  } finally { recovery.close(); }
});

test('cancellation aborts in-flight transcription and refuses a late result or overlapping upload', async () => {
  let resolve, signal;
  const recovery = new VoiceRecovery((_value, value) => { signal = value; return new Promise(done => { resolve = done; }); });
  recovery.begin(params()); send(recovery);
  const pending = recovery.finish({ recoveryId: 'one' }); const rejected = assert.rejects(pending, /ended/);
  recovery.cancel({ recoveryId: 'other' }); assert.equal(signal.aborted, false);
  recovery.cancel({ recoveryId: 'one' }); assert.equal(signal.aborted, true);
  assert.throws(() => recovery.begin(params('two')), /busy/);
  resolve('Too late'); await rejected; assert.equal(recovery.upload, null);
  recovery.begin(params('two')); recovery.close(); assert.equal(recovery.upload, null);
});

test('invalid durations, oversized audio, corrupt base64 and checksums are rejected', async () => {
  const recovery = new VoiceRecovery(async () => 'unused');
  try {
    assert.throws(() => recovery.begin({ ...params(), bytes: 6000000 }));
    assert.throws(() => recovery.begin({ ...params(), durationMs: 12 }));
    recovery.begin({ ...params(), sha256: '0'.repeat(64) });
    assert.throws(() => recovery.chunk({ recoveryId: 'one', offset: 0, data: ' A A==' }));
    send(recovery); await assert.rejects(recovery.finish({ recoveryId: 'one' }), /checksum/);
  } finally { recovery.close(); }
});

test('the Voice lease authorizes recovery and closing it cancels pending audio', async () => {
  const voice = new MobileVoiceSession({ start: async () => ({ adapterSessionId: 'adapter', sdp: 'v=0 answer' }),
    transcribe: async () => 'words', stop: async () => {}, subscribe: () => () => {} }, () => {});
  const chat = { canonicalChatId: 'chat' };
  const result = await voice.dispatch('voice.start', { sdp: 'v=0 offer' }, chat); assert.equal(result.recoveryAvailable, true);
  await assert.rejects(voice.dispatch('voice.recovery.begin', { ...params(), adapterSessionId: 'old' }, chat));
  await assert.rejects(voice.dispatch('voice.recovery.begin', { ...params(), adapterSessionId: 'adapter' }, { canonicalChatId: 'other' }));
  await voice.dispatch('voice.recovery.begin', { ...params(), adapterSessionId: 'adapter' }, chat);
  const buffer = voice.recovery.upload.buffer;
  await voice.close(); assert.equal(buffer.every(value => value === 0), true);
  await assert.rejects(voice.dispatch('voice.recovery.begin', { ...params(), adapterSessionId: 'adapter' }, chat));
});

test('oversized recovered text cannot overflow the canonical event transport', async () => {
  const recovery = new VoiceRecovery(async () => '🔴'.repeat(20000));
  recovery.begin(params()); send(recovery);
  await assert.rejects(recovery.finish({ recoveryId: 'one' }), /event limit/);
  assert.equal(recovery.upload, null); recovery.close();
});

test('abandoned uploads expire and multiple phones share one bounded memory budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const idle = new VoiceRecovery(async () => 'unused'); idle.begin(params());
  const buffer = idle.upload.buffer;
  context.mock.timers.tick(30001);
  assert.equal(idle.upload, null); assert.equal(buffer.every(value => value === 0), true); idle.close();
  const phones = Array.from({ length: 5 }, () => new VoiceRecovery(async () => 'unused'));
  const full = { ...params(), bytes: 5760044, durationMs: 120000 };
  try {
    for (const phone of phones.slice(0, 4)) phone.begin(full);
    assert.throws(() => phones[4].begin(full), /busy/);
    phones[0].close(); phones[4].begin(full);
  } finally { phones.forEach(phone => phone.close()); }
});
