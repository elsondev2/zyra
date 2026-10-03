import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowAssistantBrowserNativeView } from '../src/renderer/src/pages/assistant/assistant-browser-native-view-visibility'
import { nextAssistantBrowserSlotRevision } from '../src/renderer/src/pages/assistant/assistant-browser-slot-revision'

const revisionHost: Record<string, number | undefined> = {}
const firstSlotRevision = nextAssistantBrowserSlotRevision(revisionHost, 1_000)
const secondSlotRevision = nextAssistantBrowserSlotRevision(revisionHost, 900)
assert.ok(secondSlotRevision > firstSlotRevision, 'Browser slot revisions remain monotonic when an HMR reload starts in an earlier clock bucket')

assert.equal(shouldShowAssistantBrowserNativeView({ hasPage: false, requestedVisible: true }), false, 'blank Chromium cannot cover New Tab input')
assert.equal(shouldShowAssistantBrowserNativeView({ hasPage: true, requestedVisible: true }), true, 'selected loaded page stays native')
assert.equal(shouldShowAssistantBrowserNativeView({ hasPage: true, requestedVisible: false }), false, 'hidden slot stays hidden')

const newTabSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserNewTab.tsx', import.meta.url), 'utf8')
const browserWorkspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const browserWebviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx', import.meta.url), 'utf8')
const browserViewContractSource = readFileSync(new URL('../src/shared/browser-view.ts', import.meta.url), 'utf8')
const browserViewManagerSource = readFileSync(new URL('../src/main/browser-view-manager.ts', import.meta.url), 'utf8')
const browserCssSource = readFileSync(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')
assert.match(
    newTabSource,
    /className="no-drag pointer-events-auto absolute inset-0 z-10/,
    'New Tab explicitly owns pointer and Electron no-drag interaction'
)
assert.match(newTabSource, /type="submit" className="[^"]*self-stretch[^"]*" title="Open"/, 'the New Tab search action fills the field height, including its hover highlight')
assert.match(newTabSource, /onLoad=\{\(\) => setLoadedBackgroundUrl\(activeBackground\.imageUrl\)\}[\s\S]*opacity: loadedBackgroundUrl === activeBackground\.imageUrl \? 1 : 0/, 'new backgrounds appear only after image load')
assert.match(browserWorkspaceSource, /if \(accessoryNewTabVisible\) accessoryNewTabMountedRef\.current = true[\s\S]*?!chatIntegration && accessoryNewTabMountedRef\.current \? \([\s\S]*?<AssistantBrowserNewTab/, 'accessory blank tabs share one mounted New Tab view across tab creation and switching')
assert.match(browserWorkspaceSource, /!accessoryNewTabVisible && 'invisible pointer-events-none'/, 'the shared blank surface cannot cover a loaded page')
assert.match(browserCssSource, /\.accessory-browser-workspace \.assistant-browser-viewport-frame[\s\S]*?transition: none/, 'accessory tab switches never fade through the white viewport')
assert.match(browserViewContractSource, /type: 'new-tab'/, 'the native Browser command contract exposes an explicit New Tab reset')
assert.match(browserViewManagerSource, /command\.type === 'new-tab'[\s\S]*page\.loadURL\('about:blank'\)/, 'New Tab clears the retained Chromium page before Zyra paints its New Tab surface')
assert.match(browserWebviewSource, /showNewTab:[\s\S]*type: 'new-tab'/, 'the Browser view handle exposes the native New Tab reset to the workspace')
assert.doesNotMatch(browserWebviewSource, /preparePresentation|presentation-start/, 'New Tab and browser menus need no media preparation')
assert.match(browserWebviewSource, /revision: nextAssistantBrowserSlotRevision\(window\)/, 'slot revisions survive HMR')
assert.match(browserWorkspaceSource, /const showNewTabInActiveTab[\s\S]*showNewTab\(\)[\s\S]*url: ''[\s\S]*status: 'idle'/, 'Home resets the same tab state instead of creating another Browser tab')
assert.match(browserWorkspaceSource, /onGuestFocus=\{\(tabId\) => \{[\s\S]*?activeTabId !== tabId[\s\S]*?querySelector<HTMLInputElement>\('input'\)\?\.blur\(\)[\s\S]*?setAddressFocused\(false\)/, 'a click in the native page clears address focus only for the selected tab')
assert.match(browserWorkspaceSource, /<RotateCw size=\{13\} \/>[\s\S]*aria-label="Show New Tab in the current Browser tab"[\s\S]*<House size=\{13\} \/>/, 'the toolbar uses the single-arrow reload icon followed immediately by Home')

console.log('Browser New Tab interaction contract: ok')
