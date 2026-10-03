import assert from 'node:assert/strict';
import { zstdDecompressSync } from 'node:zlib';
import { streamSimple } from '../src/runtime/providers/src/api/openai-codex-responses.js';

const model = { id: 'future-model', name: 'Future model', api: 'openai-codex-responses', provider: 'openai-codex', baseUrl: 'https://chatgpt.com/backend-api', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const token = ['fixture', Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })).toString('base64'), 'fixture'].join('.');
const output = { type: 'message', id: 'fixture-message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Owned transport reply.', annotations: [] }] };
const events = [
  { type: 'response.created', response: { id: 'fixture-response', status: 'in_progress' } },
  { type: 'response.output_item.added', output_index: 0, item: { ...output, status: 'in_progress', content: [] } },
  { type: 'response.content_part.added', item_id: output.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
  { type: 'response.output_text.delta', item_id: output.id, output_index: 0, content_index: 0, delta: output.content[0].text },
  { type: 'response.output_item.done', output_index: 0, item: output },
  { type: 'response.completed', response: { id: 'fixture-response', status: 'completed', output: [output], usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16, input_tokens_details: { cached_tokens: 0 } } } },
];
let requests = 0;
const stream = streamSimple(model, { systemPrompt: 'Fixture only.', messages: [{ role: 'user', content: 'Reply to the fixture.', timestamp: 0 }] }, {
  apiKey: token, transport: 'sse', reasoning: 'high', maxRetries: 0,
  fetch: async (url, options) => {
    requests++;
    assert.equal(url, 'https://chatgpt.com/backend-api/codex/responses');
    assert.equal(options.headers.get('originator'), 'zyra');
    assert.match(options.headers.get('User-Agent'), /^zyra\b/);
    assert.equal(options.headers.get('chatgpt-account-id'), 'fixture-account');
    assert.equal(options.headers.get('Authorization'), `Bearer ${token}`);
    const body = options.headers.get("content-encoding") === "zstd" ? zstdDecompressSync(options.body).toString("utf8") : String(options.body);
    const payload = JSON.parse(body);
    assert.equal(payload.model, 'future-model', 'A new model ID must pass through without a catalog release.');
    assert.equal(payload.reasoning.effort, 'high');
    assert.equal(payload.store, false);
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  },
});
const received = [];
for await (const event of stream) received.push(event);
const result = await stream.result();
assert.equal(requests, 1);
assert.equal(result.stopReason, 'stop', result.errorMessage);
assert.equal(result.content[0].text, 'Owned transport reply.');
assert.equal(result.usage.input, 12);
assert.equal(result.usage.output, 4);
assert.ok(received.some(event => event.type === 'text_delta'));
assert.equal(result.usage.cost.source, 'unpriced', 'an undiscovered price is not a free model');
for (const returnedTier of ['default', 'priority']) {
  const pricedModel = { ...model, id: 'gpt-6.1-sol' };
  const responseEvents = events.map(event => event.type === 'response.completed' ? { ...event, response: { ...event.response, service_tier: returnedTier } } : event);
  const pricedStream = streamSimple(pricedModel, { messages: [{ role: 'user', content: 'Synthetic tier check', timestamp: 0 }] }, {
    apiKey: token, transport: 'sse', serviceTier: 'priority', maxRetries: 0,
    fetch: async () => new Response(responseEvents.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }),
  });
  const priced = await pricedStream.result();
  assert.equal(priced.stopReason, 'stop', priced.errorMessage);
  assert.equal(priced.usage.cost.serviceTier, returnedTier === 'default' ? 'standard' : 'fast', 'actual response tier overrides a requested tier');
  assert.ok(Math.abs(priced.usage.cost.total - (returnedTier === 'default' ? .000064 : .000128)) < 1e-12);
}
console.log('Owned Codex transport: direct request, Zyra identity, new model ID, SSE streaming and usage: ok');
