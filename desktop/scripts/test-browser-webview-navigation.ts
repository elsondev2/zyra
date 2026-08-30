import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isAssistantBrowserNativeViewOccluded } from '../src/renderer/src/pages/assistant/assistant-browser-native-view-occlusion'
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
const previewModalLayoutSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewModalLayout.tsx', import.meta.url), 'utf8')
const fileActionsMenuSource = readFileSync(new URL('../src/renderer/src/components/ui/FileActionsMenu.tsx', import.meta.url), 'utf8')
const inspectorSidebarSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantInspectorSidebar.tsx', import.meta.url), 'utf8')
const utilityWindowSource = readFileSync(new URL('../src/renderer/src/pages/assistant/utility/AssistantUtilityWindow.tsx', import.meta.url), 'utf8')
const diffPanelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const tabHoverPreviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-browser-tab-hover-preview.ts', import.meta.url), 'utf8')
const nativeOcclusionSource = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-browser-native-view-occlusion.ts', import.meta.url), 'utf8')
assert.doesNotMatch(webviewSource, /if \(active\) frame = window\.requestAnimationFrame\(\(\) => report\(\)\)/, 'Browser slot placement has no permanent layout polling loop')
assert.match(webviewSource, /const observer = active \? new ResizeObserver\(\(\) => report\(true\)\) : null/, 'only the active Browser slot observes actual size changes')
assert.doesNotMatch(webviewSource, /addEventListener\('scroll', handleViewportChange/, 'chat and Files scrolling cannot republish Browser slots')
assert.match(webviewSource, /controlOverlayInFlightRef[\s\S]*while \(controlOverlayRequestRef\.current\)/, 'Browser control overlays coalesce intermediate cursor updates')
assert.match(webviewSource, /if \(!shouldPublishOverlay && !controlOverlayPublishedRef\.current\) return/, 'inactive Browser tabs skip empty control-overlay IPC')
assert.match(webviewSource, /command\.type !== 'control-overlay' && command\.type !== 'capture'\) applyState/, 'control cursor movement and presentation capture cannot rerender the complete Browser workspace state')
assert.match(browserViewContractSource, /type: 'capture'/, 'the native Browser contract exposes an in-memory presentation snapshot command')
assert.match(browserViewManagerSource, /page\.capturePage\(\)/, 'Browser snapshots come from the owned native page')
assert.match(webviewSource, /useAssistantBrowserNativeViewOcclusion\(slotRef, active, reportNativeViewOcclusion\)/, 'app-level overlays occlude the native Browser view')
assert.match(webviewSource, /shouldShowAssistantBrowserNativeView\(\{[\s\S]*hasPage: Boolean\(tab\.url\)/, 'native visibility distinguishes a real page from Zyra New Tab')
assert.match(nativeOcclusionSource, /MutationObserver[\s\S]*attributeFilter: \['aria-hidden', 'aria-modal', 'class', 'data-zyra-native-view-occluder', 'style'\]/, 'native Browser occlusion follows portal mount, visibility, and layout changes')
assert.match(nativeOcclusionSource, /new MutationObserver\(measure\)/, 'portal occlusion is measured in the mount microtask instead of a later paint frame')
assert.doesNotMatch(nativeOcclusionSource, /requestAnimationFrame/, 'overlay detection cannot leave a native Browser surface above the first rendered menu frame')
assert.match(nativeOcclusionSource, /onOcclusionChangeRef\.current\?\.\(next\)[\s\S]*setOccluded\(next\)/, 'the native hide report runs before React publishes the derived occlusion state')
assert.match(webviewSource, /reportNativeViewOcclusion[\s\S]*nativeViewOccluded: occluded[\s\S]*useAssistantBrowserNativeViewOcclusion\(slotRef, active, reportNativeViewOcclusion\)/, 'an overlay visibility change immediately updates the native view without waiting for a second render')
assert.match(webviewSource, /nativeViewOccludedRef\.current = occluded/, 'native occlusion is published synchronously for layout observers')
assert.match(webviewSource, /const liveEffectiveVisible = shouldShowAssistantBrowserNativeView\([\s\S]*nativeViewOccluded: nativeViewOccludedRef\.current/, 'stale resize callbacks cannot republish a native Browser view over an active modal')
assert.match(nativeOcclusionSource, /const changed = occludedRef\.current \|\| occluderRef\.current !== null[\s\S]*onOcclusionChangeRef\.current\?\.\(false\)/, 'deactivating a Browser slot clears synchronous occlusion state')
assert.ok((fileActionsMenuSource.match(/data-zyra-native-view-occluder="true"/g) || []).length >= 2, 'portal menus and their submenus explicitly identify themselves as native-view occluders')
assert.match(inspectorSidebarSource, /\{tabPreview \? \([\s\S]{0,400}data-zyra-native-view-occluder="true"/, 'the docked tab hover preview explicitly occludes native Browser views')
assert.match(utilityWindowSource, /\{tabPreview \? \([\s\S]{0,400}data-zyra-native-view-occluder="true"/, 'the detached-window tab hover preview explicitly occludes native Browser views')
assert.match(tabHoverPreviewSource, /browserView\.command\(\{ tabId, type: 'capture' \}\)/, 'Browser tab hover images reuse the bounded native snapshot command')
assert.match(diffPanelSource, /previewDisabled: tab\.id === activeTabId[\s\S]{0,220}loadPreviewImage: tab\.id !== activeTabId/, 'the docked current Browser tab cannot request its own hover snapshot')
assert.match(utilityWindowSource, /previewDisabled: browserTab && active[\s\S]{0,220}loadPreviewImage: browserTab && !active/, 'the detached current Browser tab cannot request its own hover snapshot')
assert.match(inspectorSidebarSource, /if \(activeDragTabId \|\| tab\.previewDisabled\) return/, 'disabled current Browser tabs do not mount a hover card')
assert.match(inspectorSidebarSource, /tabPreview\.imageRequested[\s\S]{0,500}aspect-video[\s\S]{0,600}tabPreview\.imageUrl/, 'inactive Browser hover cards reserve a stable thumbnail frame while capture resolves')
assert.match(nativeOcclusionSource, /rectanglesOverlap\(slotBounds, bounds\)/, 'unrelated fixed UI cannot hide a Browser page unless it overlaps the native slot')
assert.match(webviewSource, /await presentation\.decode\(\)/, 'Browser presentation snapshots are decoded before they can hide the native view')
assert.match(webviewSource, /window\.requestAnimationFrame\(\(\) => (?:\{|)window\.requestAnimationFrame/, 'the decoded snapshot receives a paint frame before replacing the native page')
assert.match(webviewSource, /\{active && snapshotDataUrl \? \(/, 'the decoded snapshot stays mounted behind the native Browser view before a modal opens')
assert.match(webviewSource, /data-assistant-browser-view-snapshot/, 'a hidden native view leaves its most recent page presentation behind')
assert.match(previewModalLayoutSource, /data-zyra-native-view-occluder/, 'the file preview modal explicitly occludes native Browser views')

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
const slotBounds = { left: 100, top: 100, right: 700, bottom: 600, width: 600, height: 500 }
const slot = {
    isConnected: true,
    getBoundingClientRect: () => slotBounds,
    contains: () => false
} as unknown as HTMLElement
const candidate = (bounds: typeof slotBounds, style: { position: string; zIndex: string; opacity?: string }, attributes: Record<string, string> = {}) => ({
    isConnected: true,
    getAttribute: (name: string) => attributes[name] || null,
    getBoundingClientRect: () => bounds,
    contains: () => false,
    style
}) as unknown as HTMLElement
const modalOverlay = candidate({ left: 0, top: 0, right: 800, bottom: 700, width: 800, height: 700 }, { position: 'fixed', zIndex: '130' }, { 'aria-modal': 'true' })
const enteringModalOverlay = candidate({ left: 0, top: 0, right: 800, bottom: 700, width: 800, height: 700 }, { position: 'fixed', zIndex: '130', opacity: '0' }, { 'data-zyra-native-view-occluder': 'true' })
const lowChrome = candidate({ left: 0, top: 0, right: 800, bottom: 700, width: 800, height: 700 }, { position: 'fixed', zIndex: '20' })
const distantOverlay = candidate({ left: 710, top: 100, right: 900, bottom: 300, width: 190, height: 200 }, { position: 'fixed', zIndex: '130' })
try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
        getComputedStyle: (element: HTMLElement) => ({
            display: 'block',
            visibility: 'visible',
            opacity: (element as unknown as { style: { opacity?: string } }).style.opacity || '1',
            position: (element as unknown as { style: { position: string } }).style.position,
            zIndex: (element as unknown as { style: { zIndex: string } }).style.zIndex
        })
    } })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        querySelectorAll: () => [modalOverlay]
    } })
    assert.equal(isAssistantBrowserNativeViewOccluded(slot), true, 'an overlapping app modal occludes the native Browser surface')
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelectorAll: () => [enteringModalOverlay] } })
    assert.equal(isAssistantBrowserNativeViewOccluded(slot), true, 'an explicitly marked modal hides the native Browser surface from the first entrance frame')
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelectorAll: () => [lowChrome] } })
    assert.equal(isAssistantBrowserNativeViewOccluded(slot), false, 'ordinary low-z app chrome does not blank Browser')
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelectorAll: () => [distantOverlay] } })
    assert.equal(isAssistantBrowserNativeViewOccluded(slot), false, 'a modal outside the Browser slot does not hide the page')
} finally {
    if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocumentDescriptor) Object.defineProperty(globalThis, 'document', originalDocumentDescriptor)
    else Reflect.deleteProperty(globalThis, 'document')
}

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
