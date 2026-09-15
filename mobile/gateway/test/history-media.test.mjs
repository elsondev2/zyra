import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryMedia } from '../src/history-media.mjs';
import { projectHistoryMedia } from '../../../src/agent-server/history-media.mjs';
import { projectIndexedHistoryEntries } from '../../../src/agent-server/history-bodies.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), Buffer.alloc(70000, 3)]);
const entry = { type: 'message', id: 'entry', message: {role: 'user', content: [{type:'text',text:'Look'}, {type:'image',mimeType:'image/png',data:png.toString('base64')}] } };
test('history sends small durable image references and reads verified chunks after cache expiry', async () => {
  const projected = projectHistoryMedia(entry, 42), ref = projected.message.content[1].mediaRef;
  assert.ok(JSON.stringify(projected).length < 600); assert.equal(entry.message.content[1].data, png.toString('base64'));
  let now = 0, reads = 0; const media = new HistoryMedia({now: () => now});
  const client = { request: async (method, params) => { reads++; assert.equal(method,'catalog.history'); assert.equal(params.session,'chat'); assert.equal(params.before,43); assert.equal(params.limit,1); return {history:{entries:[{...entry,historyEntryIndex:42}]}}; } };
  const first = await media.chunk('phone','chat',ref,0,client), second = await media.chunk('phone','chat',ref,first.next,client);
  assert.deepEqual(Buffer.concat([Buffer.from(first.base64,'base64'),Buffer.from(second.base64,'base64')]),png); assert.equal(reads,1);
  now = 300001; await media.chunk('phone','chat',ref,49152,client); assert.equal(reads,2);
  const other = {request: async () => ({history:{entries:[]}})};
  await assert.rejects(media.chunk('other','chat',ref,0,other));
  await assert.rejects(media.chunk('phone','another-chat',ref,0,other));
  now += 300001;
  await assert.rejects(media.chunk('phone','chat',{...ref,sha256:'a'.repeat(64)},0,client));
  await assert.rejects(media.chunk('phone','chat',ref,-1,client));
});
test('live projection preserves user identity, bounds retained image bytes and expires safely', async () => {
  let now = 0; const media = new HistoryMedia({budget: 80000, now: () => now});
  const event = media.project('phone','chat',{type:'message_start',message:entry.message});
  assert.equal(event.message.role,'user'); assert.ok(JSON.stringify(event).length < 500);
  const ref = event.message.content[1].mediaRef;
  assert.equal((await media.chunk('phone','chat',ref,0,{})).next,49152);
  await assert.rejects(media.chunk('other','chat',ref,0,{}), {code:'MEDIA_EXPIRED'});
  now = 300001; await assert.rejects(media.chunk('phone','chat',ref,0,{}), {code:'MEDIA_EXPIRED'}); assert.equal(media.bytes,0);
});
test('entry locators retain actual indexes across corrupt records without changing ordinary history', () => {
  const directory = mkdtempSync(path.join(tmpdir(),'zyra-media-index-')); const file = path.join(directory,'session.jsonl');
  try {
    const corrupt = 'invalid\n', line = JSON.stringify(entry)+'\n'; writeFileSync(file,corrupt+line);
    const selected = [{entryIndex:8,offset:[0,Buffer.byteLength(corrupt)]},{entryIndex:9,offset:[Buffer.byteLength(corrupt),Buffer.byteLength(line)]}];
    const result = projectIndexedHistoryEntries({file,selected,options:{entryLocators:true,mediaBodies:'lazy-v1',toolResultBodies:'lazy-v1'}});
    assert.equal(result.length,1); assert.equal(result[0].historyEntryIndex,9); assert.equal(result[0].message.content[1].mediaRef.source.entryIndex,9);
    const legacy = projectIndexedHistoryEntries({file,selected,options:{}}); assert.equal(legacy[0].historyEntryIndex,undefined); assert.equal(legacy[0].message.content[1].data,png.toString('base64'));
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
