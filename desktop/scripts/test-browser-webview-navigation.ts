import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    createAssistantBrowserNavigationAttempt,
    describeAssistantBrowserNavigationError,
    isAssistantBrowserNavigationCancellation,
    loadAssistantBrowserWebviewUrl,
    observeAssistantBrowserNavigationStart,
    stopAssistantBrowserNavigation,
    supersedeAssistantBrowserNavigation,
    wasAssistantBrowserNavigationSupersededOrStopped
} from '../src/renderer/src/pages/assistant/assistant-browser-webview-navigation'

const webviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx', import.meta.url), 'utf8')
const browserViewManagerSource = readFileSync(new URL('../src/main/browser-view-manager.ts', import.meta.url), 'utf8')
const browserViewContractSource = readFileSync(new URL('../src/shared/browser-view.ts', import.meta.url), 'utf8')
const utilityWindowSource = readFileSync(new URL('../src/renderer/src/pages/assistant/utility/AssistantUtilityWindow.tsx', import.meta.url), 'utf8')
const diffPanelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const tabHoverPreviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-browser-tab-hover-preview.ts', import.meta.url), 'utf8')
// Native geometry and portal composition have separate real Electron gates.
assert.match(webviewSource, /controlOverlayInFlightRef[\s\S]*while \(controlOverlayRequestRef\.current\)/, 'cursor updates stay coalesced')
assert.match(webviewSource, /if \(!shouldPublishOverlay && !controlOverlayPublishedRef\.current\) return/, 'inactive tabs skip empty cursor IPC')
assert.match(browserViewContractSource, /type: 'capture'/, 'explicit screenshot and inactive tab-preview capture remains available')
assert.match(browserViewManagerSource, /captureBrowserPage\(page\)/, 'explicit snapshots still come from the owned native page')
assert.doesNotMatch(webviewSource, /presentation-start|presentation-stop|snapshotDataUrl|liveVideoRef|useAssistantBrowserNativeViewOcclusion/, 'menus cannot replace or hide the native page through the retired mirror')
assert.match(webviewSource, /shouldShowAssistantBrowserNativeView\(\{[\s\S]*hasPage: Boolean\(tab\.url\)/, 'New Tab remains separate from a loaded native page')
assert.match(tabHoverPreviewSource, /browserView\.command\(\{ tabId, type: 'capture' \}\)/, 'inactive tab hover images retain native capture')
assert.match(diffPanelSource, /previewDisabled: tab\.id === activeTabId[\s\S]{0,220}loadPreviewImage: tab\.id !== activeTabId/, 'active docked tab does not capture itself')
assert.match(utilityWindowSource, /previewDisabled: browserTab && active[\s\S]{0,220}loadPreviewImage: browserTab && !active/, 'active detached tab does not capture itself')

const targetUrl = 'https://www.helloj.in/'
const cancellation = new Error(`Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: ERR_ABORTED (-3) loading '${targetUrl}'`)

const redirectedAttempt = createAssistantBrowserNavigationAttempt(targetUrl)
observeAssistantBrowserNavigationStart(redirectedAttempt, targetUrl)
assert.equal(redirectedAttempt.targetStarted, true)
observeAssistantBrowserNavigationStart(redirectedAttempt, `${targetUrl}?themeRefresh=1`)
assert.equal(wasAssistantBrowserNavigationSupersededOrStopped(redirectedAttempt), true, 'a replacement main-frame navigation supersedes the awaited target')
const staleEventAttempt = createAssistantBrowserNavigationAttempt('https://example.com/b')
observeAssistantBrowserNavigationStart(staleEventAttempt, 'https://example.com/a')
assert.equal(staleEventAttempt.targetStarted, false)
assert.equal(wasAssistantBrowserNavigationSupersededOrStopped(staleEventAttempt), false, 'a stale pre-target event cannot supersede a newer attempt')
observeAssistantBrowserNavigationStart(staleEventAttempt, 'https://example.com/b')
assert.equal(staleEventAttempt.targetStarted, true)
const replacedAttempt = createAssistantBrowserNavigationAttempt(targetUrl)
supersedeAssistantBrowserNavigation(replacedAttempt)
assert.equal(wasAssistantBrowserNavigationSupersededOrStopped(replacedAttempt), true, 'a second Zyra navigation supersedes the first')
const stoppedAttempt = createAssistantBrowserNavigationAttempt(targetUrl)
stopAssistantBrowserNavigation(stoppedAttempt)
assert.equal(wasAssistantBrowserNavigationSupersededOrStopped(stoppedAttempt), true, 'the explicit Stop action authorizes a benign abort')
const standaloneAttempt = createAssistantBrowserNavigationAttempt(targetUrl)
observeAssistantBrowserNavigationStart(standaloneAttempt, targetUrl)
assert.equal(wasAssistantBrowserNavigationSupersededOrStopped(standaloneAttempt), false, 'a standalone target start is not silently discarded')

await assert.doesNotReject(
    () => loadAssistantBrowserWebviewUrl(
        async () => { throw cancellation },
        targetUrl,
        { wasSupersededOrStopped: () => wasAssistantBrowserNavigationSupersededOrStopped(redirectedAttempt) }
    ),
    'a Chromium superseded-navigation rejection must not become a visible Browser error'
)
await assert.rejects(
    () => loadAssistantBrowserWebviewUrl(
        async () => { throw cancellation },
        targetUrl,
        { wasSupersededOrStopped: () => wasAssistantBrowserNavigationSupersededOrStopped(standaloneAttempt) }
    ),
    /Navigation was cancelled before the page loaded\./u,
    'a standalone aborted navigation remains a visible, friendly failure'
)
assert.equal(isAssistantBrowserNavigationCancellation({ errno: -3 }), true, 'Electron errno -3 is a cancellation')
assert.equal(isAssistantBrowserNavigationCancellation({ errorCode: -3 }), true, 'did-fail-load code -3 is a cancellation')
assert.equal(isAssistantBrowserNavigationCancellation({ code: 'ERR_ABORTED' }), true, 'Electron symbolic abort codes are cancellations')
assert.equal(isAssistantBrowserNavigationCancellation('net::ERR_ABORTED'), true, 'serialized abort errors are cancellations')

const networkFailure = Object.assign(new Error(`ERR_NAME_NOT_RESOLVED (-105) loading '${targetUrl}'`), {
    errno: -105,
    code: 'ERR_NAME_NOT_RESOLVED'
})
assert.equal(isAssistantBrowserNavigationCancellation(networkFailure), false, 'network failures remain visible')
assert.equal(describeAssistantBrowserNavigationError(networkFailure), 'This site’s address could not be found.')
await assert.rejects(
    () => loadAssistantBrowserWebviewUrl(
        async () => { throw networkFailure },
        targetUrl,
        { wasSupersededOrStopped: () => false }
    ),
    /This site’s address could not be found\./u,
    'real network failures must reach Browser error state without exposing Electron IPC internals'
)
assert.equal(describeAssistantBrowserNavigationError(new Error('net::ERR_CONNECTION_REFUSED')), 'The site refused the connection.')
assert.equal(describeAssistantBrowserNavigationError(new Error('net::ERR_CERT_DATE_INVALID')), 'Zyra could not verify this site’s security certificate.')
assert.equal(describeAssistantBrowserNavigationError(new Error('unexpected engine failure')), 'The page could not be loaded.')

let loadedUrl = ''
await loadAssistantBrowserWebviewUrl(
    async (url) => { loadedUrl = url },
    targetUrl,
    { wasSupersededOrStopped: () => false }
)
assert.equal(loadedUrl, targetUrl, 'successful navigations still use the requested URL')

console.log('Browser webview navigation cancellation: ok')
