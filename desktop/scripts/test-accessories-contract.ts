import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { desktopWebLink } from '../src/shared/desktop-link-policy'
import {
    closeAssistantBrowserTab,
    createAssistantBrowserWorkspaceState
} from '../src/renderer/src/pages/assistant/assistant-browser-workspace-state'
import {
    ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD,
    isAccessoryBrowserTabTearOff,
    movedAccessoryBrowserTabBounds
} from '../src/renderer/src/pages/accessories/accessory-browser-tab-drag'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const contract = read('../src/shared/accessories.ts')
const manager = read('../src/main/accessory-window-manager.ts')
const main = read('../src/main/index.ts')
const preload = read('../src/preload/adapters/accessories-adapter.ts')
const browser = read('../src/renderer/src/pages/accessories/AccessoryBrowser.tsx')
const browserSync = read('../src/renderer/src/pages/accessories/useAccessoryBrowserTabSync.ts')
const accessoryTerminal = read('../src/renderer/src/pages/accessories/AccessoryTerminal.tsx')
const workspace = read('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx')
const webview = read('../src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx')
const terminal = read('../src/renderer/src/pages/assistant/AssistantTerminalWorkspace.tsx')
const agentControl = read('../src/main/agent-control/index.ts')

assert.match(contract, /AccessoryKind = 'browser' \| 'terminal' \| 'files'/)
assert.match(contract, /open\(input: AccessoryOpenInput\)/)
assert.match(contract, /getState\(\)/)
assert.match(contract, /acknowledge\(requestId: string\)/)
assert.match(contract, /syncBrowserTabs\(input: AccessoryBrowserTabsInput\)/)
assert.match(contract, /beginBrowserTabTearOff\(input: AccessoryBrowserTearOffBeginInput\)/)
assert.match(contract, /finishBrowserTabTearOff\(input: AccessoryBrowserTearOffFinishInput\)/)
assert.match(contract, /cancelBrowserTabTearOff\(sessionId: string\)/)
assert.match(contract, /registerBrowserDropZone\(input: AccessoryBrowserDropZoneInput \| null\)/)
assert.match(contract, /onChanged\(callback:/)
assert.match(preload, /ipcRenderer\.invoke\(ACCESSORIES_IPC\.open/)
assert.match(preload, /ACCESSORIES_IPC\.beginBrowserTabTearOff/)
assert.match(preload, /ACCESSORIES_IPC\.finishBrowserTabTearOff/)
assert.match(preload, /ACCESSORIES_IPC\.cancelBrowserTabTearOff/)
assert.match(preload, /removeListener\(ACCESSORIES_IPC\.changed/)
assert.match(manager, /desktopWebLink\(rawUrl\)/, 'main validates queued navigation with the desktop web-link policy')
assert.match(manager, /record\.state\.requests\.push\(request\)/)
assert.match(manager, /record\.state\.requests\.splice\(requestIndex, 1\)/)
assert.match(manager, /requireOwnedRecord\(event\)/)
assert.match(manager, /serializeMove/, 'Browser tear-off commits are serialized')
assert.match(manager, /expectedSourceWindow: source\.window/, 'native transfer validates the exact source owner')
assert.match(manager, /expectedSessionMode: source\.state\.sessionMode/, 'native transfer keeps normal and incognito ownership separate')
assert.match(manager, /rollbackTearOff/, 'cancelled and failed Browser tear-offs have an explicit rollback path')
assert.match(main, /return accessoryWindowId \? `accessory:\$\{accessoryWindowId\}` : null/)
assert.match(main, /rootPath: app\.getPath\('home'\)/)
assert.match(browser, /chatIntegration=\{false\}/)
assert.match(browser, /tabIdPrefix=\{tabIdPrefix\}/)
assert.match(browser, /onOpenPreview=\{preview\.openPreview\}/)
assert.match(browser, /<AccessoryHeaderPortal>/, 'Browser tabs render into the merged accessory header')
assert.match(browser, /role="tablist"/)
assert.doesNotMatch(browser, /h-9 shrink-0 items-end/, 'Browser tabs no longer consume a second body row')
assert.match(browser, /beginBrowserTabTearOff/)
assert.match(browserSync, /closeTab\(tab\.id, \{ transferred: true \}\)/, 'source metadata removal cannot close the transferred native page')
assert.match(browser, /onTabsChange=\{onTabsChange\}/, 'Accessory Browser passes a stable synchronization callback to the workspace')
assert.match(browser, /controller\?\.createTab/)
assert.match(browser, /controller\?\.closeTab/)
assert.match(workspace, /agentControlEnabled=\{chatIntegration\}/)
assert.match(webview, /if \(!agentControlEnabled \|\| disposedRef\.current/)
assert.match(agentControl, /ownerThreadId\.startsWith\('accessory:'\)/, 'main rejects accidental agent-control binding for accessory owners')
assert.match(terminal, /kind: 'accessory-window'/)
assert.match(accessoryTerminal, /terminalOwner=\{\{ kind: 'accessory-window', workspaceId \}\}/, 'the accessory wrapper requests a scoped terminal capability')
assert.match(main, /resolveOwnedTerminalRuntimeId\(event\.sender\.id, owner\.workspaceId\)/)
assert.match(main, /onTerminalWindowClosed: disposePreviewTerminalRuntime/)

assert.equal(desktopWebLink('https://example.test/path?q=1'), 'https://example.test/path?q=1')
assert.equal(desktopWebLink('https://user:secret@example.test/'), null)
assert.equal(desktopWebLink('file:///private.txt'), null)

assert.equal(ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD, 44)
const tabBounds = { left: 20, right: 140, top: 3, bottom: 35 }
const stripBounds = { left: 0, right: 500, top: 0, bottom: 40 }
assert.equal(isAccessoryBrowserTabTearOff(movedAccessoryBrowserTabBounds(tabBounds, { x: 80, y: 20 }), stripBounds), false, 'horizontal and near-strip motion stays in the source window')
assert.equal(isAccessoryBrowserTabTearOff(movedAccessoryBrowserTabBounds(tabBounds, { x: 0, y: 52 }), stripBounds), true, 'crossing the vertical threshold starts native tear-off')

const incognito = createAssistantBrowserWorkspaceState('browser:accessory:test:0', 'incognito')
const replacement = closeAssistantBrowserTab(incognito, incognito.activeTabId, 'browser:accessory:test:1', 'incognito')
assert.equal(replacement.tabs[0]?.sessionMode, 'incognito', 'closing the last standalone incognito tab keeps its replacement incognito')

console.log('Chat-independent Accessories contract: ok')
