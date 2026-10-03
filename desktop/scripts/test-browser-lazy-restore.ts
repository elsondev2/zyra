import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { browserTabsToMount } from '../src/renderer/src/pages/assistant/assistant-browser-lazy-restore.ts'

const none = browserTabsToMount(new Set(), false, 'restored-a', null)
assert.deepEqual([...none], [], 'hidden Browser workspaces do not load restored pages')
const first = browserTabsToMount(none, true, 'restored-a', null)
assert.deepEqual([...first], ['restored-a'], 'only the selected restored page loads')
const switched = browserTabsToMount(first, true, 'restored-b', null)
assert.deepEqual([...switched], ['restored-a', 'restored-b'], 'a visited tab stays live after switching')
const split = browserTabsToMount(switched, true, 'restored-b', 'restored-c')
assert.deepEqual([...split], ['restored-a', 'restored-b', 'restored-c'], 'a visible split tab also loads')
const workspace = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const inspector = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
assert.match(workspace, /mountedBrowserTabIdsRef\.current\.has\(tab\.id\) \? <AssistantBrowserWebview/, 'restored hidden tabs do not construct native pages')
assert.match(inspector, /browserTab\?\.status === 'idle' && Boolean\(browserTab\.url\)/, 'a restored URL shows the loading indicator before navigation starts')
console.log('Browser lazy restore check passed')
