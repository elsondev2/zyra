import assert from 'node:assert/strict'
import { reorderBrowserTabs } from '../src/renderer/src/pages/assistant/assistant-browser-tab-order'
const tabs = [{ id: 'a', marker: { live: true } }, { id: 'b', marker: { live: true } }]
const moved = reorderBrowserTabs(tabs, ['b', 'a'])
assert.deepEqual(moved.map(tab => tab.id), ['b', 'a'])
assert.equal(moved[0], tabs[1], 'ordering preserves live tab descriptors')
assert.equal(reorderBrowserTabs(tabs, ['a', 'b']), tabs)
for (const ids of [['a'], ['a', 'a'], ['a', 'unknown'], []]) assert.equal(reorderBrowserTabs(tabs, ids), tabs, 'invalid orders never drop or duplicate tabs')
console.log('Browser tab order: exact permutations, identity, no-op and invalid input preservation: ok')
