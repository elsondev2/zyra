import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MobileDictationSession, DICTATION_METHODS } from '../src/dictation-session.mjs';
import { MobileVoiceSession } from '../src/voice-session.mjs';
import { HostRouter, isRead } from '../src/router.mjs';
const audio = readFileSync(new URL('../../android/app/src/test/resources/recovered-voice.wav', import.meta.url));
const chat = { canonicalChatId: 'chat', project: '/shared' };
const params = (id='one') => ({ session:'alias', recoveryId:id, bytes:audio.length, durationMs:2000, sha256:createHash('sha256').update(audio).digest('hex') });
async function send(session) { for (let offset=0;offset<audio.length;offset+=49152) await session.dispatch('dictation.chunk',{...params(),offset,data:audio.subarray(offset,offset+49152).toString('base64')},chat); }
const api = transcribe => ({ state:async()=>({available:true,signedIn:true}), transcribe });

test('dictation returns draft text through bounded transient upload without a live Voice lease', async () => {
  const d = new MobileDictationSession(api(async input => { assert.deepEqual(Buffer.from(input.audioBase64,'base64'),audio); return 'Insert these words'; }));
  try {
    assert.equal((await d.dispatch('dictation.status',{},chat)).signedIn,true);
    await d.dispatch('dictation.begin',params(),chat); await send(d);
    assert.deepEqual(await d.dispatch('dictation.finish',params(),chat),{text:'Insert these words'});
    assert.equal(d.busy,false);
    for(const method of DICTATION_METHODS) assert.equal(isRead(method),true,'recordings and text must not enter command journal');
  } finally { d.close(); }
});
test('cross-chat calls fail and disconnect cancels provider work and refuses late text', async () => {
  let release, started, aborted=false;
  const startedPromise=new Promise(resolve=>started=resolve);
  const d=new MobileDictationSession(api(async (_input,signal)=>{ started(); signal.addEventListener('abort',()=>aborted=true); await new Promise(resolve=>release=resolve); return 'late'; }));
  await d.dispatch('dictation.begin',params(),chat);
  await assert.rejects(d.dispatch('dictation.chunk',{...params(),offset:0,data:'AA=='},{canonicalChatId:'other'}),/own/);
  await send(d); const pending=d.dispatch('dictation.finish',params(),chat); const rejected=assert.rejects(pending);
  await startedPromise; d.detach('wrong'); assert.equal(aborted,false); d.detach('alias'); assert.equal(aborted,true);
  await assert.rejects(d.dispatch('dictation.begin',params('two'),chat),/processed/);
  release(); await rejected; assert.equal(d.busy,false); d.close();
});
test('a separate phone cannot append, finish or cancel another recording', async () => {
  const a=new MobileDictationSession(api(async()=> 'a')), b=new MobileDictationSession(api(async()=> 'b'));
  try { await a.dispatch('dictation.begin',params(),chat); await assert.rejects(b.dispatch('dictation.finish',params(),chat)); await assert.rejects(b.dispatch('dictation.cancel',params(),chat)); assert.equal(a.busy,true); }
  finally { a.close(); b.close(); }
});
test('router requires attachment and current device project access for dictation', async () => {
  let calls=0;
  const router=new HostRouter({client:{request:async()=>({chat})},owner:'phone',cache:{},projects:['/shared'],voice:{dispatch:async()=>{calls++;return{};}}});
  await assert.rejects(router.dispatch('dictation.status',{session:'chat'})); router.attached.add('chat');
  await router.dispatch('dictation.status',{session:'chat'}); assert.equal(calls,1);
  router.hiddenProjects=['/shared']; await assert.rejects(router.dispatch('dictation.status',{session:'chat'})); assert.equal(calls,1);
});
test('Voice and dictation keep separate authority and cannot overlap on one phone', async () => {
  let voiceStarts=0;
  const session=new MobileVoiceSession({ dictation:api(async()=> 'draft'), start:async()=>{voiceStarts++; return {adapterSessionId:'voice',sdp:'v=0 answer'};},stop:async()=>{},subscribe:()=>()=>{} },()=>{});
  try {
    await session.dispatch('dictation.begin',params(),chat);
    await assert.rejects(session.dispatch('voice.start',{sdp:'v=0 offer'},chat)); assert.equal(voiceStarts,0);
    await session.dispatch('dictation.cancel',params(),chat);
    await session.dispatch('voice.start',{sdp:'v=0 offer'},chat);
    await assert.rejects(session.dispatch('dictation.begin',params(),chat),/End Voice/);
  } finally { await session.close(); }
});
