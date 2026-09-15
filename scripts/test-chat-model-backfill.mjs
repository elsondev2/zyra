import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, statSync, openSync, writeSync, closeSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanModelPresentation } from '../src/agent-server/chat-model-scan.mjs';
import { ChatModelBackfill } from '../src/agent-server/chat-model-backfill.mjs';
import { CanonicalChatIndex } from '../src/agent-server/chat-index.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zyra-model-backfill-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'chat.jsonl') };
}
function lines(file, entries) {
  let offset = 0; const offsets = [];
  writeFileSync(file, entries.map(entry => { const line = JSON.stringify(entry); offsets.push([offset, Buffer.byteLength(line)]); offset += Buffer.byteLength(line) + 1; return line; }).join('\n') + '\n');
  return offsets;
}
test('streamed metadata matches branch models and ignores convincing values inside tool output', async t => {
  const { file } = fixture(t);
  const offsets = lines(file, [
    { type: 'model_change', id: 'root', parentId: null, provider: 'openai', modelId: 'a' },
    { type: 'model_change', id: 'other', parentId: 'root', modelId: 'b' },
    { type: 'message', id: 'work', parentId: 'root', message: { role: 'toolResult', content: [{ type: 'model_change', modelId: 'fake', message: { role: 'assistant', model: 'fake' } }] } },
    { type: 'message', id: 'answer', parentId: 'work', message: { content: 'hello', role: 'assistant', provider: 'provider', model: { id: 'é🪴', provider: 'actual' } } }
  ]);
  const result = await scanModelPresentation(file, offsets, { wait: async () => {} });
  assert.equal(result.model, 'actual/é🪴');
  assert.equal(result.modelNames.includes('fake'), false);
});
test('large message bodies stream in bounded chunks while model fields after the body still load', async t => {
  const { file } = fixture(t);
  const start = '{"type":"message","id":"answer","parentId":null,"message":{"content":"';
  const end = '","role":"assistant","provider":"openai","model":"large-history-model"}}';
  const fd = openSync(file, 'w');
  try { writeSync(fd, start); const chunk = Buffer.alloc(65536, 'x'); for (let i = 0; i < 128; i++) writeSync(fd, chunk); writeSync(fd, end); } finally { closeSync(fd); }
  let metrics, pauses = 0;
  const result = await scanModelPresentation(file, [[0, statSync(file).size]], { wait: async () => { pauses++; }, progress: value => { metrics = value; } });
  assert.equal(result.model, 'openai/large-history-model');
  assert.equal(metrics.chunkBytes, 65536); assert.ok(metrics.maxRetainedChars <= 512); assert.ok(pauses >= 128);
  assert.ok(JSON.stringify(result).length < 512, 'message text is not retained in model metadata');
});
test('changed or cancelled files cannot publish stale model metadata', async t => {
  const { file } = fixture(t), offsets = lines(file, [{ type: 'model_change', id: 'one', modelId: 'old' }]);
  const stats = statSync(file), record = { sessionPath: file, fileSize: stats.size, fileMtimeMs: stats.mtimeMs, entryOffsets: offsets };
  let release, called = false, committed = 0;
  const held = new Promise(resolve => { release = resolve; });
  const queue = new ChatModelBackfill({ get: () => record, commit: () => { committed++; }, scan: async () => { called = true; await held; return { model: 'old' }; } });
  queue.enqueue(['one']);
  while (!called) await new Promise(resolve => setTimeout(resolve, 1));
  appendFileSync(file, '\n'); release(); await queue.idle(); assert.equal(committed, 0);
  let aborted = false;
  const cancelled = new ChatModelBackfill({ get: () => ({ ...record, fileSize: statSync(file).size, fileMtimeMs: statSync(file).mtimeMs }), commit: () => { committed++; }, scan: async (_file, _offsets, { signal }) => {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); aborted = true; signal.throwIfAborted();
  } });
  cancelled.enqueue(['one']); await new Promise(resolve => setTimeout(resolve, 10)); cancelled.close(); await cancelled.idle(); assert.ok(aborted); assert.equal(committed, 0);
});
test('legacy index is enriched after the list returns without replacing history offsets or changing recency', async t => {
  const { root } = fixture(t), project = path.join(root, 'project'), directory = path.join(project, '.zyra/sessions');
  mkdirSync(directory, { recursive: true }); const file = path.join(directory, 'chat.jsonl');
  lines(file, [{ type: 'session', id: 'chat', cwd: project }, { type: 'model_change', id: 'one', parentId: null, modelId: 'legacy-model' }]);
  const stateDirectory = path.join(root, 'state'); let index = new CanonicalChatIndex({ stateDirectory });
  await index.listProjects([project]); const recordPath = path.join(stateDirectory, 'chat-index-v3.json');
  const saved = JSON.parse(readFileSync(recordPath));
  for (const key of ['model', 'modelPresentationVersion', 'modelLineage', 'modelNames', 'modelLeaf']) delete saved.chats.chat[key];
  writeFileSync(recordPath, JSON.stringify(saved)); index = new CanonicalChatIndex({ stateDirectory });
  const [before] = await index.listProjects([project]); assert.equal(before.model, undefined);
  const notices = []; index.on('modelsChanged', change => notices.push(change));
  index.queueModelPresentations(['chat']); assert.equal(index.get('chat').model, undefined, 'hydration is asynchronous');
  await index.modelBackfill.idle();
  assert.equal(index.get('chat').model, 'legacy-model'); assert.equal(index.get('chat').modifiedAt, before.modifiedAt);
  assert.deepEqual(index.snapshot().chats.chat.entryOffsets, saved.chats.chat.entryOffsets); assert.equal(notices.length, 1);
  await index.closeModelBackfill();
});

test('visible legacy models use one reader and batched persistence', async t => {
  const { file } = fixture(t), offsets = lines(file, [{ type: 'model_change', id: 'one', modelId: 'a' }]);
  const stats = statSync(file);
  const records = new Map(Array.from({ length: 40 }, (_, i) => [String(i), { sessionPath: file, fileSize: stats.size, fileMtimeMs: stats.mtimeMs, entryOffsets: offsets }]));
  let inFlight = 0, peak = 0, commits = 0, flushes = 0;
  const queue = new ChatModelBackfill({ get: id => records.get(id), commit: (id, model) => { records.set(id, { ...records.get(id), ...model }); commits++; },
    flush: () => { flushes++; }, scan: async () => { peak = Math.max(peak, ++inFlight); await new Promise(resolve => setTimeout(resolve, 1)); inFlight--; return { modelPresentationVersion: 1, model: 'a' }; } });
  queue.enqueue([...records.keys()]); await queue.idle();
  assert.equal(peak, 1); assert.equal(commits, 40); assert.equal(flushes, 3);
});

test('streamed duplicate fields obey the final JSON value without retaining a replaced assistant model', async t => {
  const { file } = fixture(t);
  const line = '{"type":"message","id":"one","parentId":null,"message":{"role":"assistant","model":"obsolete"},"message":null}';
  writeFileSync(file, line);
  assert.equal((await scanModelPresentation(file, [[0, Buffer.byteLength(line)]])).model, null);
});
