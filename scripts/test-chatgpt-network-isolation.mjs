import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZyraRuntime } from '../src/zyra-runtime.mjs';
import { ZyraCredentialStore, createZyraCredentialAuthStorage } from '../src/zyra-auth-store.mjs';

const root = await mkdtemp(join(tmpdir(), 'zyra-network-isolation-'));
const credential = { type: 'oauth', accountId: 'fixture-network', access: `fixture.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-network' } })).toString('base64url')}.fixture`, refresh: 'fixture-refresh', expires: Date.now() + 3600000 };
const model = { id: 'fixture-model', name: 'Fixture model', api: 'openai-codex-responses', provider: 'openai-codex', baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const messages = { messages: [{ role: 'user', content: 'Fixture.', timestamp: 0 }] };
const output = { type: 'message', id: 'fixture-message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Recovered.', annotations: [] }] };
const events = [
    { type: 'response.created', response: { id: 'fixture-response', status: 'in_progress' } },
    { type: 'response.output_item.added', output_index: 0, item: { ...output, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', item_id: output.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: output.id, output_index: 0, content_index: 0, delta: 'Recovered.' },
    { type: 'response.output_item.done', output_index: 0, item: output },
    { type: 'response.completed', response: { id: 'fixture-response', status: 'completed', output: [output], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
];
const success = () => new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const consume = async (runtime, fetch, selected = model, signal) => {
    const stream = runtime.modelRuntime.streamSimple(selected, messages, { transport: 'sse', fetch, signal: signal ?? AbortSignal.timeout(5000) });
    for await (const _ of stream) { /* consume the real native transport */ }
    return stream.result();
};
try {
    for (const failure of ['socket', 502, 503, 504, 401, 429, 403, 404]) {
        const authPath = join(root, String(failure), 'credentials', 'auth.json');
        const store = new ZyraCredentialStore({ authPath });
        const options = { credentialStore: store, authPath, modelsPath: null, loadSavedProviders: false, loadOpenAICatalog: false, refreshOnCreate: false, refreshAccountUsage: false, env: {} };
        await (await createZyraCredentialAuthStorage(options)).loginOAuth('openai-codex', credential);
        const first = await createZyraRuntime(options);
        const siblingStore = new ZyraCredentialStore({ authPath });
        const sibling = await createZyraRuntime({ ...options, credentialStore: siblingStore });
        let failedRequests = 0;
        const failed = await consume(first, async () => {
            failedRequests++;
            if (failure === 'socket') throw new TypeError('fetch failed: fixture socket disconnected');
            return new Response(JSON.stringify({ error: { message: failure === 403 || failure === 404 ? 'Model permission access denied' : `Fixture upstream ${failure}` } }), { status: failure, headers: failure === 429 ? { 'retry-after': '120' } : {} });
        });
        assert.equal(failed.stopReason, 'error');
        assert.equal(failedRequests, 1, 'pool retries remain bounded; recovery belongs to the request owner');
        const persisted = siblingStore.read('openai-codex');
        assert.equal(persisted.access, credential.access, 'a transport failure must not erase or replace credentials');
        let siblingRequests = 0;
        const resumed = await consume(sibling, async () => { siblingRequests++; return success(); });
        const transient = failure === 'socket' || [502, 503, 504].includes(failure);
        if (transient) {
            assert.equal(resumed.stopReason, 'stop', `${failure}: a shared cooldown must not block an unrelated thread: ${resumed.errorMessage}`);
            assert.equal(siblingRequests, 1);
            assert.equal(Object.keys(persisted.pool?.cooldowns || {}).length, 0, `${failure}: no persisted account/model ban for infrastructure failures`);
            assert.match(failed.errorMessage, failure === 'socket' ? /socket|fetch failed/i : new RegExp(String(failure)), 'the request owner retains the original recoverable failure, not a fabricated account error');
            assert.equal((await consume(first, async () => success())).stopReason, 'stop', 'a later recovery attempt can immediately reuse valid auth');
        } else {
            assert.equal(resumed.stopReason, 'error', `${failure}: real account restrictions still reject the next request`);
            assert.equal(siblingRequests, 0, `${failure}: no bypassing sign-in, rate limits or model permissions`);
            if (failure === 401) assert.equal(persisted.pool.requiresLogin, true);
            else assert.ok(Object.values(persisted.pool.cooldowns).some(value => value.until > Date.now()));
            if (failure === 403 || failure === 404) assert.equal((await consume(sibling, async () => success(), { ...model, id: 'other-fixture-model' })).stopReason, 'stop', 'model permission failures remain model-specific');
        }
    }
    console.log('Native Codex network isolation: socket/502/503/504 preserve sibling and recovery requests; 401/429/model permissions stay enforced.');
} finally { await rm(root, { recursive: true, force: true }); }
