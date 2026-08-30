import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
    loadAssistantInspectorWorkspaceState,
    normalizeAssistantInspectorWorkspaceState,
    persistAssistantInspectorWorkspaceState,
    reconcileAssistantInspectorBrowserTabs,
    reorderAssistantInspectorWorkspaceTabs,
    restoreAssistantInspectorWorkspaceState
} from '../src/renderer/src/pages/assistant/assistant-inspector-workspace-state'

const normalized = normalizeAssistantInspectorWorkspaceState({
    version: 1,
    activeTabId: 'agents',
    tabs: [
        { id: 'terminal', kind: 'terminal' },
        { id: 'explorer', kind: 'explorer' },
        { id: 'control', kind: 'control' },
        { id: 'resources', kind: 'resources' },
        { id: 'agents', kind: 'agents' },
        { id: 'review', kind: 'review' },
        { id: 'browser:kept', kind: 'browser', browserTabId: 'browser:kept' },
        { id: 'browser:stale', kind: 'browser', browserTabId: 'browser:stale' },
        { id: 'turn:turn-7', kind: 'turn', turnId: 'turn-7' },
        { id: 'terminal-copy', kind: 'terminal' },
        { id: 'unsafe', kind: 'browser', browserTabId: 'javascript:unsafe' }
    ]
})
assert.ok(normalized)
const restored = restoreAssistantInspectorWorkspaceState(normalized, ['browser:kept'])
assert.equal(restored.activeTabId, 'agents')
assert.deepEqual(restored.tabs.map((tab) => tab.id), [
    'terminal',
    'explorer',
    'control',
    'resources',
    'agents',
    'review',
    'browser:kept',
    'turn:turn-7'
])
assert.equal(restored.tabs.filter((tab) => tab.kind === 'terminal').length, 1)
const reorderedForward = reorderAssistantInspectorWorkspaceTabs(restored.tabs, 'terminal', 'review')
assert.deepEqual(reorderedForward.map((tab) => tab.id), [
    'explorer',
    'control',
    'resources',
    'agents',
    'review',
    'terminal',
    'browser:kept',
    'turn:turn-7'
], 'horizontal drag preview commits the dragged tab at the live collision target')
const reorderedBackward = reorderAssistantInspectorWorkspaceTabs(reorderedForward, 'turn:turn-7', 'explorer')
assert.deepEqual(reorderedBackward.slice(0, 2).map((tab) => tab.id), ['turn:turn-7', 'explorer'])
assert.equal(reorderAssistantInspectorWorkspaceTabs(reorderedBackward, 'missing', 'review'), reorderedBackward, 'stale drag identities cannot rewrite tab order')
const interleavedBrowserTabs = [
    { id: 'browser:a', kind: 'browser', browserTabId: 'browser:a' } as const,
    { id: 'explorer', kind: 'explorer' } as const,
    { id: 'browser:b', kind: 'browser', browserTabId: 'browser:b' } as const,
    { id: 'terminal', kind: 'terminal' } as const
]
assert.equal(
    reconcileAssistantInspectorBrowserTabs(interleavedBrowserTabs, ['browser:a', 'browser:b']),
    interleavedBrowserTabs,
    'Browser metadata refreshes preserve an interleaved user-defined Inspector order'
)
assert.deepEqual(
    reconcileAssistantInspectorBrowserTabs(interleavedBrowserTabs, ['browser:a', 'browser:new', 'browser:b']).map((tab) => tab.id),
    ['browser:a', 'browser:new', 'explorer', 'browser:b', 'terminal'],
    'new Browser identities join the nearest Browser neighbor without regrouping existing tabs'
)
assert.deepEqual(
    reconcileAssistantInspectorBrowserTabs(interleavedBrowserTabs, ['browser:b']).map((tab) => tab.id),
    ['explorer', 'browser:b', 'terminal'],
    'stale Browser identities leave without moving surviving non-Browser tabs'
)
assert.deepEqual(
    restoreAssistantInspectorWorkspaceState(null, ['browser:migrated']),
    {
        version: 1,
        activeTabId: 'review',
        tabs: [
            { id: 'review', kind: 'review' },
            { id: 'browser:migrated', kind: 'browser', browserTabId: 'browser:migrated' }
        ]
    }
)

const values = new Map<string, string>()
const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
}
globalThis.window = {} as Window & typeof globalThis
globalThis.localStorage = localStorage as Storage
persistAssistantInspectorWorkspaceState('chat-a', restored)
assert.deepEqual(loadAssistantInspectorWorkspaceState('chat-a'), restored, 'complete Inspector state round-trips per chat')
persistAssistantInspectorWorkspaceState('chat-a', { version: 1, activeTabId: '', tabs: [] })
assert.deepEqual(loadAssistantInspectorWorkspaceState('chat-a'), { version: 1, activeTabId: '', tabs: [] }, 'closing the final tab persists an empty workspace instead of reviving stale tabs')
assert.equal(loadAssistantInspectorWorkspaceState('chat-b'), null, 'unrelated chats do not inherit another chat’s Inspector tabs')

const panelSource = await readFile(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
assert.match(panelSource, /restoreAssistantInspectorWorkspaceState/)
assert.match(panelSource, /persistAssistantInspectorWorkspaceState/)
assert.match(panelSource, /if \(!reviewIndexReady\) return/)
assert.doesNotMatch(panelSource, /setWorkspaceTabs\(\[REVIEW_TAB, \.\.\.restoredBrowserTabs\]\)/)
assert.match(panelSource, /persistAssistantInspectorWorkspaceState\(browserWorkspaceKey, \{ version: 1, activeTabId: '', tabs: \[\] \}\)/)

console.log('Desktop assistant Inspector workspace persistence tests passed.')
