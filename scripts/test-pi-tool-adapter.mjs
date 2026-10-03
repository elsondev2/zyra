import assert from 'node:assert/strict';
import { registerPiZyraTools } from '../src/integrations/pi/zyra-tools.mjs';
import { registerPiAttention, notificationScript } from '../src/integrations/pi/attention.mjs';

const tools = new Map(), events = new Map();
let active = ['read', 'bash'], ends = 0, closes = 0;
const pi = {
  registerTool(tool) { tools.set(tool.name, tool); active.push(tool.name); },
  registerCommand() {},
  getActiveTools() { return active; }, setActiveTools(names) { active = names; },
  on(name, handler) { const handlers = events.get(name) || []; handlers.push(handler); events.set(name, handlers); },
  events: { emit() {} },
};
const notify = [];
registerPiZyraTools(pi, { createClient: () => ({ async close() { closes++; }, async endTurn() { ends++; },
  async status() { return { available: true }; },
  async request(operation) { return { targets: [{ targetId: 'chrome:fixture', kind: 'chrome-tab' }], operation: operation.operation,
    observation: { revision: 2, elements: [] }, screenshot: { mimeType: 'image/png', data: 'aGVsbG8=' } }; } }) });
registerPiAttention(pi, { notify(title, text) { notify.push({ title, text }); return { started: true }; } });
const ctx = { cwd: process.cwd(), hasUI: true, sessionManager: { getSessionId: () => 'fixture' } };
const emit = async (name, event = {}) => { for (const handler of events.get(name) || []) await handler(event, ctx); };
await emit('session_start');
assert(active.includes('read') && active.includes('bash'), 'preserve native and unrelated tools');
assert(active.includes('browser_use') && active.includes('zyra_tool_search'));
assert(!active.includes('browser_act') && !active.includes('computer_click'), 'defer expensive schemas until needed');
await tools.get('browser_use').execute('load:1', { action: 'load' });
assert(active.includes('browser_act'));
await tools.get('zyra_tool_search').execute('load:2', { query: 'Windows computer' });
assert(active.includes('computer_use_app'));
const listed = await tools.get('browser_tabs').execute('tabs:1', { operation: 'list' });
assert(listed.content[0].text.includes('chrome-tab'));
const observed = await tools.get('browser_observe').execute('observe:1', { grantId: 'grant', targetId: 'tab', mode: 'both' });
assert(observed.content.some(item => item.type === 'image'), 'screenshots reach Pi as image content');
await emit('tool_call', { toolName: 'ask_user', input: { question: 'Which design?' } });
await emit('tool_call', { toolName: 'ask_user', input: { question: 'Which design?' } });
assert.equal(notify.length, 1, 'input attention is automatic and duplicate suppressed');
await tools.get('full_send_notify').execute('notify', { kind: 'complete', summary: 'Verified fixture' }, undefined, undefined, ctx);
assert.equal(notify.length, 2);
assert.equal(notificationScript("It's ready", "hello'; malicious" ).includes("'hello''; malicious'"), true, 'PowerShell payload is quoted as a literal');
await emit('agent_end');
assert.equal(ends, 1);
assert(!active.includes('browser_act') && !active.includes('computer_click'));
await emit('session_shutdown');
assert.equal(closes, 1);
console.log(`PASS Pi adapter: ${tools.size} registered tools, deferred activation, images, input attention and turn cleanup`);
