import assert from 'node:assert/strict';
import { createFleetTools } from '../src/agents/tools.mjs';
import { describeZyraToolPermission } from '../src/zyra-permission-gate.mjs';
let inspected;
const [agent] = createFleetTools({ controller: {
  delegationModelOptions: async request => { inspected = request; return { preset: 'cost', models: [{ id: 'fixture/model', estimatedApiCost: null }] }; },
  spawn: () => { throw Error('A model lookup must never spawn work.'); }
} });
assert.ok(JSON.stringify(agent.parameters).includes('models'));
assert.match(agent.description, /action=models/);
const result = await agent.execute('lookup', { action: 'models', provider: 'fixture', limit: 3 });
assert.equal(inspected.provider, 'fixture'); assert.equal(inspected.limit, 3);
assert.equal(JSON.parse(result.content[0].text).models[0].estimatedApiCost, null);
assert.equal(describeZyraToolPermission({ toolName: 'agent', input: { action: 'models' } }), null, 'model discovery is read-only');
console.log('Delegation tool: actual tool schema/dispatch, bounded lookup contract and read-only permission classification: ok');
