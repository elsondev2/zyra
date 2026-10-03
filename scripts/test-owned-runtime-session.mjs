import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAgentSession, ModelRuntime, SettingsManager, DefaultResourceLoader } from '../src/runtime/engine/src/index.js';
import { AssistantMessageEventStream } from '../src/runtime/providers/src/utils/event-stream.js';
import { envApiKeyAuth } from '../src/runtime/providers/src/auth/helpers.js';
import { loadExtensions } from '../src/runtime/engine/src/core/extensions/loader.js';
import { ZyraSessionManager } from '../src/agent-server/zyra-session-manager.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-owned-session-'));
let session;
try {
  const model = { id: 'fixture', name: 'Fixture', provider: 'fixture', api: 'fixture', baseUrl: 'https://fixture.invalid', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 };
  const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const message = (content, stopReason = 'stop') => ({ role: 'assistant', content, api: model.api, provider: model.provider, model: model.id, usage, stopReason, timestamp: Date.now() });
  let request = 0;
  let cancelMode = false;
  let signalReceived;
  const stream = (_model, context, options) => {
    const result = new AssistantMessageEventStream();
    signalReceived = options.signal;
    if (cancelMode) {
      const cancelled = () => { result.push({ type: 'error', reason: 'aborted', error: { ...message([]), stopReason: 'aborted', errorMessage: 'Cancelled' } }); result.end(); };
      if (options.signal.aborted) cancelled();
      else options.signal.addEventListener('abort', cancelled, { once: true });
      return result;
    }
    const final = request++ === 0
      ? message([{ type: 'toolCall', id: 'fixture-tool', name: 'fixture_echo', arguments: { text: 'tool result' } }], 'toolUse')
      : message([{ type: 'text', text: 'Finished with the tool result.' }]);
    if (request === 2) assert.equal(context.messages.findLast(entry => entry.role === 'toolResult').content[0].text, 'tool result');
    queueMicrotask(() => {
      result.push({ type: 'start', partial: final });
      if (final.stopReason === 'stop') result.push({ type: 'text_delta', contentIndex: 0, delta: final.content[0].text, partial: final });
      result.push({ type: 'done', reason: final.stopReason, message: final });
      result.end();
    });
    return result;
  };
  const runtime = await ModelRuntime.create({ authPath: path.join(directory, 'auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  runtime.registerNativeProvider({ id: 'fixture', auth: { apiKey: envApiKeyAuth('Fixture', []) }, getModels: () => [model], stream, streamSimple: stream });
  await runtime.setRuntimeApiKey('fixture', 'synthetic-test-key');
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Synthetic runtime test.' });
  await resourceLoader.reload();
  const sessionManager = ZyraSessionManager.create(directory, path.join(directory, 'sessions'));
  ({ session } = await createAgentSession({ cwd: directory, agentDir: directory, modelRuntime: runtime, model, settingsManager, resourceLoader, sessionManager, tools: ['fixture_echo'], customTools: [{ name: 'fixture_echo', label: 'Echo', description: 'Echo fixture', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, execute: async (_id, args) => ({ content: [{ type: 'text', text: args.text }], details: {} }) }] }));
  const events = [];
  session.subscribe(event => events.push(event));
  await session.prompt('Run the fixture tool.');
  assert.ok(events.some(event => event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta'));
  assert.equal(events.find(event => event.type === 'tool_execution_end').isError, false);
  assert.equal(request, 2);
  const reopened = ZyraSessionManager.open(sessionManager.getSessionFile());
  assert.deepEqual(reopened.buildSessionContext().messages.map(entry => entry.role), ['user', 'assistant', 'toolResult', 'assistant']);
  assert.equal(reopened.buildSessionContext().messages.at(-1).content[0].text, 'Finished with the tool result.');
  cancelMode = true;
  signalReceived = undefined;
  const pending = session.prompt('Wait for cancellation.');
  for (let i = 0; !signalReceived; i++) {
    if (i > 100) throw new Error('Session did not begin the cancellation fixture.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  await session.abort();
  await pending;
  assert.equal(signalReceived.aborted, true);
  assert.equal(session.isStreaming, false);
  for (const [name, specifier] of [['zyra', '@zyra/engine'], ['legacy', '@earendil-works/pi-coding-agent']]) {
    const extension = path.join(directory, `${name}.ts`);
    await writeFile(extension, `import { DynamicBorder } from '${specifier}'; import { Text } from '@zyra/terminal'; export default function(api) { if (typeof DynamicBorder !== 'function' || typeof Text !== 'function') throw Error('Missing local runtime'); api.registerCommand('fixture_${name}', { description: 'Fixture', handler: async () => {} }); }`);
    const loaded = await loadExtensions([extension], directory);
    assert.deepEqual(loaded.errors, []);
    assert.ok(loaded.extensions[0].commands.has(`fixture_${name}`));
  }
  console.log('Owned runtime session: streaming, tool execution, persisted replay, cancellation, own and legacy extensions: ok');
} finally {
  session?.dispose();
  await rm(directory, { recursive: true, force: true });
}
