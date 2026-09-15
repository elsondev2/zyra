import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textAttachment, appendTextAttachments } from '../src/text-attachments.mjs';
import { UploadStore } from '../src/uploads.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

test('text files accept UTF8 source and reject binary, oversized and unsupported formats', () => {
  assert.equal(textAttachment('hello.TS', Buffer.from('const hi = "hello \u{1f44b}";')), 'const hi = "hello \u{1f44b}";');
  for (const [name, data] of [['file.pdf', Buffer.from('%PDF')], ['file.md', Buffer.from([0xff])], ['file.txt', Buffer.from('a\0b')], ['file.txt', Buffer.alloc(180001, 65)]]) assert.throws(() => textAttachment(name, data));
  const prompt = appendTextAttachments('Review this', [{name: 'demo.ts', size: 4, content: '<hello>'}]);
  assert.match(prompt, /Attached files \(1\):\n1\. demo.ts \[FILE\]/); assert.match(prompt, /content:\n<hello>/); assert.ok(!prompt.includes('path:'));
});
test('resumable text upload validates checksum and ownership at send and cannot be sent as image', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-text-')); t.after(() => rm(directory, {recursive:true, force:true}));
  const store = new UploadStore(directory), bytes = Buffer.from('# A document\n\nSome text.');
  const p = { uploadId: randomUUID(), name: 'notes.md', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await store.begin('phone','chat',p); await store.chunk('phone','chat',{uploadId:p.uploadId,offset:0,base64:bytes.toString('base64')});
  assert.equal((await store.finish('phone','chat',p.uploadId)).mimeType, 'text/plain');
  assert.equal((await store.files('phone','chat',[p.uploadId]))[0].content, bytes.toString());
  await assert.rejects(store.files('other','chat',[p.uploadId]), /another device/);
  await assert.rejects(store.files('phone','other',[p.uploadId]), /another device/);
  await assert.rejects(store.files('phone','chat',[p.uploadId,p.uploadId]), /distinct/);
  await assert.rejects(store.images('phone','chat',[p.uploadId]), /supported image/);
  await writeFile(store.paths(p.uploadId).bytes, Buffer.alloc(bytes.length,65));
  await assert.rejects(store.files('phone','chat',[p.uploadId]), /changed/);
});

import { HostRouter } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';
test('file upload references become desktop file context and never reach canonical provider payload', async () => {
  const calls = [], cleaned = [];
  const router = new HostRouter({owner:'phone',projects:['/shared'],cache:new BodyCache(),client:{request:async (_method,params)=>{calls.push(params);return{};}},uploads:{
    files:async(owner,chat,ids)=>{assert.equal(owner,'phone');assert.equal(chat,'chat');assert.deepEqual(ids,['file']);return [{name:'notes.md',size:4,content:'text'}];},
    cancel:async(owner,chat,id)=>{cleaned.push(id);}
  }});
  const request={sessionKey:'chat',type:'prompt',payload:{prompt:'Review',fileUploads:['file']}};
  await assert.rejects(router.dispatch('session.request',request,'a'));
  router.attached.add('chat');await router.dispatch('session.request',request,'a');
  assert.match(calls[0].payload.prompt,/notes.md \[FILE\]/);assert.equal(calls[0].payload.fileUploads,undefined);assert.equal(calls[0].payload.images,undefined);assert.deepEqual(cleaned,['file']);
  await assert.rejects(router.dispatch('session.request',{...request,payload:{...request.payload,fileUploads:['file','file']}},'b'));
  assert.equal(calls.length,1);
});
