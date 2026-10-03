import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ModelRuntime } from '../src/runtime/engine/src/index.js';
import { AssistantMessageEventStream } from '../src/runtime/providers/src/utils/event-stream.js';
import { envApiKeyAuth } from '../src/runtime/providers/src/auth/helpers.js';
import { createZyraPermissionReviewer } from '../src/zyra-permission-reviewer.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-reviewer-runtime-'));
let reviewer;
try {
  const model = { provider: 'fixture', id: 'current-chat-model', name: 'Fixture', api: 'fixture', baseUrl: 'https://fixture.invalid', reasoning: true, input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  let reviews = 0;
  const stream = (reviewModel, context, options) => {
    assert.equal(reviewModel.id, model.id);
    assert.equal(reviewModel.provider, model.provider);
    assert.equal(options.apiKey, 'synthetic-parent-connection');
    assert.equal(context.tools?.length || 0, 0, 'the real reviewer session has no tools');
    assert.match(context.systemPrompt, /classification is only a candidate flag/);
    assert.match(context.messages.findLast(message => message.role === 'user').content[0].text, /ffprobe/);
    reviews += 1;
    const message = { role: 'assistant', provider: model.provider, model: model.id, api: model.api, usage, timestamp: Date.now(), stopReason: 'stop',
      content: [{ type: 'text', text: '{"decision":"approve","risk":"low","reason":"Media metadata only."}' }] };
    const events = new AssistantMessageEventStream();
    queueMicrotask(() => {
      events.push({ type: 'start', partial: message });
      events.push({ type: 'done', reason: 'stop', message });
      events.end();
    });
    return events;
  };
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(directory, 'auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  modelRuntime.registerNativeProvider({ id: model.provider, auth: { apiKey: envApiKeyAuth('Fixture', []) }, getModels: () => [model], stream, streamSimple: stream });
  await modelRuntime.setRuntimeApiKey(model.provider, 'synthetic-parent-connection');
  const parentMessages = [{ role: 'user', content: 'Inspect the video.' }];
  reviewer = createZyraPermissionReviewer({ project: directory, runtime: { session: { model, modelRuntime, state: { messages: parentMessages } } } });
  await reviewer.warm();
  for (let index = 0; index < 2; index += 1) {
    const decision = await reviewer.review({ toolName: 'bash', requestType: 'command', command: 'ffprobe -show_entries format=duration source.mp4', userRequest: 'Inspect the video.' });
    assert.equal(decision.decision, 'approve');
    assert.equal(decision.model, 'fixture/current-chat-model');
  }
  assert.equal(reviews, 2);
  assert.equal(parentMessages.length, 1, 'reviews must not alter the main chat history');
  assert.equal(existsSync(path.join(directory, '.zyra', 'agent-runs', 'permission-reviewer')), false, 'reviewer sessions must stay in memory');
} finally {
  reviewer?.dispose();
  await rm(directory, { recursive: true, force: true });
}
console.log('Permission reviewer runtime: separate tool-free session, current model, parent connection and isolated history passed.');
