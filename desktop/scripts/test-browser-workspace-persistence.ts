import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    addAssistantBrowserTab,
    createAssistantBrowserWorkspaceState,
    ensureAssistantBrowserWorkspaceTab,
    hasPersistedAssistantBrowserWorkspaceState,
    loadAssistantBrowserWorkspaceState,
    persistAssistantBrowserWorkspaceState
} from '../src/renderer/src/pages/assistant/assistant-browser-workspace-state'
import {
    loadAssistantInspectorWorkspaceState,
    persistAssistantInspectorWorkspaceState,
    restoreAssistantInspectorWorkspaceState
} from '../src/renderer/src/pages/assistant/assistant-inspector-workspace-state'

const source = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
assert.ok(/useEffect\(\(\) => \{\s*if \(persistState\) persistAssistantBrowserWorkspaceState\(workspaceKey, workspaceStateRef\.current\)\s*\}, \[persistState, workspaceKey\]\)/.test(source), 'mount saves the initial Browser state even when opening a blank tab produces no later mutation')
const panel = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
assert.ok(panel.includes('mounted={browserOpen && workspaceHydratedKey === browserWorkspaceKey}'), 'a new chat must hydrate before mounting Browser with its selected tab')
assert.ok(panel.includes('if (!browserOpen || workspaceHydratedKey !== browserWorkspaceKey) return'), 'old Browser identities cannot reconcile against a newly selected chat')

const values = new Map<string, string>()
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
} })
try {
    const initial = ensureAssistantBrowserWorkspaceTab(createAssistantBrowserWorkspaceState(), 'browser:chat-a:new')
    assert.equal(ensureAssistantBrowserWorkspaceTab(initial, initial.activeTabId), initial, 'opening the already-initialized blank tab does not cause a mutation to save it')
    persistAssistantBrowserWorkspaceState('chat-a', initial)
    persistAssistantInspectorWorkspaceState('chat-a', {
        version: 1, activeTabId: initial.activeTabId,
        tabs: [{ id: 'explorer', kind: 'explorer' }, { id: initial.activeTabId, kind: 'browser', browserTabId: initial.activeTabId }, { id: 'terminal', kind: 'terminal' }]
    })
    persistAssistantBrowserWorkspaceState('chat-b', createAssistantBrowserWorkspaceState('browser:chat-b:new'))
    assert.equal(hasPersistedAssistantBrowserWorkspaceState('chat-a'), true)
    const browser = loadAssistantBrowserWorkspaceState('chat-a')
    const inspector = restoreAssistantInspectorWorkspaceState(loadAssistantInspectorWorkspaceState('chat-a'), browser.tabs.map(tab => tab.id))
    assert.deepEqual(inspector.tabs.map(tab => tab.id), ['explorer', 'browser:chat-a:new', 'terminal'])
    assert.equal(inspector.activeTabId, initial.activeTabId)
    assert.equal(browser.tabs[0].url, '')
    assert.deepEqual(loadAssistantBrowserWorkspaceState('chat-b').tabs.map(tab => tab.id), ['browser:chat-b:new'], 'chat state is isolated')

    const pages = addAssistantBrowserTab(initial, 'browser:chat-a:docs', 'https://example.test/docs', true)
    const privateAndPublic = addAssistantBrowserTab(pages, 'browser:private', 'https://private.test/secret', true, 'incognito')
    persistAssistantBrowserWorkspaceState('chat-a', privateAndPublic)
    const restored = loadAssistantBrowserWorkspaceState('chat-a')
    assert.deepEqual(restored.tabs.map(tab => tab.id), ['browser:chat-a:new', 'browser:chat-a:docs'])
    assert.equal(restored.tabs[1].url, 'https://example.test/docs')
    assert.doesNotMatch([...values.values()].join(''), /private\.test|browser:private/, 'private Browser tabs remain excluded')
    console.log('Browser workspace persistence: initial blank tab, chat return, tab order, URL restore and incognito exclusion passed')
} finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
}
