import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectFleetList } from '../src/fleet-projection.mjs';
test('fleet lists page summaries without repeatedly transferring source or run transcripts', () => {
  const result = { definitions: { active: [{ name: 'review', runnable: true, definition: { description: 'Review changes', prompt: 'x'.repeat(100000), tools: ['read'] } }] }, runs: Array.from({length: 31}, (_, i) => ({ agentRunId: String(i), createdAt: String(i).padStart(2, '0'), result: { text: 'x'.repeat(10000) }, status: 'completed' })) };
  const page = projectFleetList(result); assert.equal(page.runs.length, 30); assert.equal(page.nextOffset, 30);
  assert.equal(page.runs[0].agentRunId, '30'); assert.equal(page.definitions[0].prompt, undefined); assert.equal(page.runs[0].result, undefined);
  assert.ok(JSON.stringify(page).length < 5000);
  assert.equal(projectFleetList(result, {offset: 30}).runs[0].agentRunId, '0');
});
