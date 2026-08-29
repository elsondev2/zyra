import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowAssistantBrowserNativeView } from '../src/renderer/src/pages/assistant/assistant-browser-native-view-visibility'
import { nextAssistantBrowserSlotRevision } from '../src/renderer/src/pages/assistant/assistant-browser-slot-revision'

const revisionHost: Record<string, number | undefined> = {}
const firstSlotRevision = nextAssistantBrowserSlotRevision(revisionHost, 1_000)
const secondSlotRevision = nextAssistantBrowserSlotRevision(revisionHost, 900)
assert.ok(secondSlotRevision > firstSlotRevision, 'Browser slot revisions remain monotonic when an HMR reload starts in an earlier clock bucket')

assert.equal(shouldShowAssistantBrowserNativeView({
    hasPage: false,
    requestedVisible: false,
    nativeViewOccluded: false
}), false, 'the blank Chromium view cannot retain input ownership above Zyra New Tab')

assert.equal(shouldShowAssistantBrowserNativeView({
    hasPage: true,
    requestedVisible: true,
    nativeViewOccluded: false
}), true, 'a visible loaded page stays native and interactive')

assert.equal(shouldShowAssistantBrowserNativeView({
    hasPage: true,
    requestedVisible: false,
    nativeViewOccluded: false
}), false, 'a Browser shell overlay owns input immediately instead of sitting underneath native Chromium')

assert.equal(shouldShowAssistantBrowserNativeView({
    hasPage: true,
    requestedVisible: false,
    nativeViewOccluded: false
}), false, 'a loaded page yields input after its replacement snapshot paints')

assert.equal(shouldShowAssistantBrowserNativeView({
    hasPage: true,
    requestedVisible: true,
    nativeViewOccluded: true
}), false, 'a global renderer modal cannot be blocked by an occluded native Chromium view')

const newTabSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserNewTab.tsx', import.meta.url), 'utf8')
const browserWorkspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const browserWebviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx', import.meta.url), 'utf8')
const browserDownloadsSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserDownloadsButton.tsx', import.meta.url), 'utf8')
const browserViewContractSource = readFileSync(new URL('../src/shared/browser-view.ts', import.meta.url), 'utf8')
const browserViewManagerSource = readFileSync(new URL('../src/main/browser-view-manager.ts', import.meta.url), 'utf8')
assert.match(
    newTabSource,
    /className="no-drag pointer-events-auto absolute inset-0 z-10/,
    'New Tab explicitly owns pointer and Electron no-drag interaction'
)
assert.match(browserViewContractSource, /type: 'new-tab'/, 'the native Browser command contract exposes an explicit New Tab reset')
assert.match(browserViewManagerSource, /command\.type === 'new-tab'[\s\S]*page\.loadURL\('about:blank'\)/, 'New Tab clears the retained Chromium page before Zyra paints its New Tab surface')
assert.match(browserWebviewSource, /showNewTab:[\s\S]*type: 'new-tab'/, 'the Browser view handle exposes the native New Tab reset to the workspace')
assert.match(
    browserWebviewSource,
    /preparePresentation:[\s\S]*preparePresentationSnapshot/,
    'the Browser view handle can prepare a current frame before a shell overlay opens'
)
assert.match(browserWorkspaceSource, /prepareActiveBrowserOverlay[\s\S]*preparePresentation\(\)/, 'Browser shell overlays prepare the active page before taking renderer ownership')
assert.match(browserWorkspaceSource, /omniboxPresentationReady/, 'omnibox suggestions wait for their current page presentation instead of flashing above Chromium')
assert.match(browserWebviewSource, /revision: nextAssistantBrowserSlotRevision\(window\)/, 'native Browser visibility revisions survive renderer hot reloads')
assert.match(
    browserDownloadsSource,
    /await onBeforeOverlayOpen\?\.\(\)[\s\S]*onOverlayChange\?\.\(true\)[\s\S]*setOpen\(true\)/,
    'Downloads prepares the page and transfers shell ownership before rendering its popover'
)
assert.match(browserWorkspaceSource, /const showNewTabInActiveTab[\s\S]*showNewTab\(\)[\s\S]*url: ''[\s\S]*status: 'idle'/, 'Home resets the same tab state instead of creating another Browser tab')
assert.match(browserWorkspaceSource, /<RotateCw size=\{13\} \/>[\s\S]*aria-label="Show New Tab in the current Browser tab"[\s\S]*<House size=\{13\} \/>/, 'the toolbar uses the single-arrow reload icon followed immediately by Home')

console.log('Browser New Tab interaction contract: ok')
