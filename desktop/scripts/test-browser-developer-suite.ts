import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    clampAssistantBrowserViewportSize,
    resolveAssistantBrowserViewportLayout,
    resizeAssistantBrowserViewport
} from '../src/renderer/src/pages/assistant/assistant-browser-viewport-layout'
import {
    normalizeAssistantBrowserViewport,
    normalizeAssistantBrowserZoom
} from '../src/renderer/src/pages/assistant/assistant-browser-workspace-state'

const root = join(import.meta.dirname, '..')
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')

const contracts = read('src/shared/contracts/devscope-api.ts')
const registry = read('src/main/agent-control/trusted-guest-registry.ts')
const handlers = read('src/main/ipc/handlers/browser-preview-developer-handlers.ts')
const registration = read('src/main/ipc/handlers.ts')
const preload = read('src/preload/adapters/projects-adapter.ts')
const workspace = read('src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx')
const browserWebview = read('src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx')
const browserDeviceToolbar = read('src/renderer/src/pages/assistant/AssistantBrowserDeviceToolbar.tsx')
const fileActionsMenu = read('src/renderer/src/components/ui/FileActionsMenu.tsx')
const transientMenu = read('src/renderer/src/lib/transient-menu.ts')
const rendererStyles = read('src/renderer/src/index.css')
const annotationScript = read('src/main/ipc/handlers/browser-preview-annotation-script.ts')
const annotationComposer = read('src/renderer/src/pages/assistant/assistant-browser-annotation-composer.ts')
const composerController = read('src/renderer/src/pages/assistant/useAssistantComposerController.ts')
const composerSections = read('src/renderer/src/pages/assistant/AssistantComposerSections.tsx')
const inspectorToast = read('src/renderer/src/pages/assistant/AssistantInspectorDeveloperToast.tsx')
const diffPanel = read('src/renderer/src/pages/assistant/AssistantDiffPanel.tsx')
const viewportState = read('src/renderer/src/pages/assistant/assistant-browser-workspace-state.ts')
const webviewSecurity = read('src/main/ipc/handlers/browser-preview-handlers.ts')

assert.match(webviewSecurity, /contextIsolation=true,sandbox=true,nodeIntegration=false/)
assert.match(registry, /resolveOwned\(ownerWebContentsId: number, guestWebContentsId: number, tabId: string\)/)
assert.match(registry, /entry\.ownerWebContentsId !== ownerWebContentsId/)
assert.match(registry, /entry\.tabId !== tabId/)
assert.match(handlers, /trustedBrowserGuests\.resolveOwned\(event\.sender\.id, guestWebContentsId, tabId\)/)
assert.match(handlers, /artifactId: string/)
assert.match(handlers, /ownerWebContentsId: number/)
assert.match(handlers, /recordingSaveGrants/)
assert.match(handlers, /RECORDING_MAX_BYTES = 128 \* 1024 \* 1024/)
assert.doesNotMatch(handlers, /Overlay\.setInspectMode/, 'the user-facing annotation flow does not enter persistent CDP inspect mode')
assert.match(handlers, /executeJavaScriptInIsolatedWorld/)
assert.match(handlers, /attributes\.value = '\[redacted\]'/)
assert.match(handlers, /Page\.startScreencast/)
assert.match(handlers, /Page\.screencastFrameAck/)
assert.match(handlers, /reloadIgnoringCache\(\)/)
assert.match(handlers, /Emulation\.setEmulatedMedia/)
assert.match(handlers, /guest\.openDevTools\(\{ mode: 'detach'/)
assert.doesNotMatch(contracts, /getBrowserWebContents/)
const artifactContract = contracts.slice(
    contracts.indexOf('export type DevScopeBrowserCaptureArtifact'),
    contracts.indexOf('export type DevScopeBrowserRecordingFrame')
)
assert.doesNotMatch(artifactContract, /\bpath:/, 'renderer artifacts expose opaque IDs rather than filesystem paths')
assert.doesNotMatch(preload, /webContents\.fromId/)

for (const channel of [
    'hardReload',
    'setZoom',
    'setColorScheme',
    'openDevTools',
    'captureScreenshot',
    'stageArtifactForAssistant',
    'openArtifact',
    'startAnnotation',
    'cancelAnnotation',
    'startRecording',
    'stopRecording',
    'saveRecording'
]) {
    assert.match(registration, new RegExp(`devscope:browserPreview:${channel}`))
}

for (const method of [
    'hardReloadBrowserPreview',
    'setBrowserPreviewZoom',
    'setBrowserPreviewColorScheme',
    'openBrowserPreviewDevTools',
    'captureBrowserPreviewScreenshot',
    'stageBrowserPreviewArtifactForAssistant',
    'openBrowserPreviewArtifact',
    'startBrowserPreviewAnnotation',
    'cancelBrowserPreviewAnnotation',
    'startBrowserPreviewRecording',
    'saveBrowserPreviewRecording'
]) {
    assert.match(contracts, new RegExp(`${method}:`))
    assert.match(preload, new RegExp(`${method}:`))
}

assert.match(workspace, /AssistantBrowserDeviceToolbar/)
assert.match(workspace, /AssistantBrowserViewportFrame/)
assert.match(workspace, /Capture screenshot/)
assert.match(workspace, /Annotate page/)
assert.match(workspace, /Record Browser tab/)
assert.match(workspace, /Open DevTools/)
assert.match(workspace, /Clear cache/)
assert.match(workspace, /Clear cookies/)
assert.doesNotMatch(workspace, /developerNotice/)
assert.match(transientMenu, /zyra:dismiss-transient-menus/)
assert.match(browserWebview, /addEventListener\('focus', handleGuestFocus\)/, 'clicking the guest page dismisses host-renderer menus')
assert.match(browserWebview, /dismissTransientMenus\(\)/)
assert.match(workspace, /window\.addEventListener\(TRANSIENT_MENU_DISMISS_EVENT, dismissProfileMenu\)/)
assert.match(workspace, /window\.addEventListener\('keydown', handleEscape\)/)
assert.match(browserDeviceToolbar, /window\.addEventListener\(TRANSIENT_MENU_DISMISS_EVENT, dismissDeviceMenu\)/)
assert.match(browserDeviceToolbar, /window\.addEventListener\('keydown', closeOnEscape\)/)
assert.match(fileActionsMenu, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/)
assert.match(fileActionsMenu, /window\.addEventListener\(TRANSIENT_MENU_DISMISS_EVENT, dismiss\)/)
assert.match(fileActionsMenu, /maxHeight: Math\.max\(1, spaceBelow - gap\)/)
assert.match(fileActionsMenu, /'fixed z-\[340\]'/)
assert.doesNotMatch(fileActionsMenu, /'fixed z-\[340\] overflow-hidden'/, 'portal wrapper must not clip the menu edge or shadow')
const menuAnimationStyles = rendererStyles.slice(
    rendererStyles.indexOf('@keyframes assistantMenuInDown'),
    rendererStyles.indexOf('.animate-slideInFromTop')
)
assert.doesNotMatch(menuAnimationStyles, /clip-path/, 'menu arrival motion must not crop its final border')
assert.match(menuAnimationStyles, /transform-origin: top right/)
assert.match(annotationScript, /type Tool = 'select' \| 'region' \| 'draw' \| 'erase'/)
assert.match(annotationScript, /Describe the change…/)
assert.match(annotationScript, /attach\.textContent = 'Attach'/)
assert.match(annotationScript, /event\.key === 'Escape'/)
assert.match(annotationScript, /MAX_ELEMENTS = 40/)
assert.match(annotationScript, /MAX_REGIONS = 64/)
assert.match(annotationScript, /MAX_STROKES = 64/)
assert.match(annotationScript, /MAX_POINTS = 2_048/)
assert.match(annotationScript, /clearButton\.addEventListener\('click', clear\)/)
assert.match(workspace, /publishAssistantBrowserAnnotationAttachment/)
assert.match(workspace, /stageBrowserPreviewArtifactForAssistant/)
assert.match(annotationComposer, /<preview_annotation>/)
assert.match(composerController, /subscribeAssistantBrowserAnnotationAttachments/)
assert.match(composerSections, /AssistantBrowserAnnotationCard/)
assert.ok((workspace.match(/cancelAnnotation\(\)/g) || []).length >= 5, 'navigation, tab, Inspector, DevTools, and recording transitions finish annotation state')
assert.match(inspectorToast, /Browser screenshot preview/)
assert.match(inspectorToast, /openBrowserPreviewArtifact/)
assert.match(inspectorToast, /revealBrowserPreviewArtifact/)
assert.match(inspectorToast, /mode: 'path'/)
assert.doesNotMatch(inspectorToast, /Swipe right to dismiss/)
assert.match(inspectorToast, /bg-\[var\(--surface-floating\)\]/)
assert.match(inspectorToast, /hover:bg-\[color-mix\(in_srgb,var\(--color-card\)_82%,var\(--accent-primary\)_18%\)\]/)
assert.doesNotMatch(inspectorToast, /hover:bg-\[var\(--surface-hover\)\]/)
assert.doesNotMatch(inspectorToast, /hover:-translate|hover:scale|hover:shadow-md/)
assert.match(inspectorToast, /distance >= 72/)
assert.match(inspectorToast, /setPointerCapture/)
assert.match(inspectorToast, /closing: true/)
assert.match(inspectorToast, /translate3d\(calc\(100% \+ 24px\)/)
assert.match(inspectorToast, /assistant-screenshot-preview-arrive/)
assert.doesNotMatch(inspectorToast, /\.animate\(/, 'screenshot arrival avoids per-element Web Animations work')
const screenshotPreviewMotionStyles = rendererStyles.slice(
    rendererStyles.indexOf('@keyframes assistantScreenshotPreviewArrive'),
    rendererStyles.indexOf('@keyframes browser-loading-slide')
)
assert.match(screenshotPreviewMotionStyles, /140ms/)
assert.match(screenshotPreviewMotionStyles, /translate3d\(28px, 0, 0\)/)
assert.doesNotMatch(screenshotPreviewMotionStyles, /filter:|scale\(/, 'screenshot arrival stays on cheap opacity and translation properties')
assert.match(screenshotPreviewMotionStyles, /prefers-reduced-motion: reduce/)
assert.doesNotMatch(workspace, /data-assistant-browser-screenshot-flight/)
assert.match(handlers, /SCREENSHOT_PREVIEW_MAX_WIDTH = 640/)
assert.match(handlers, /SCREENSHOT_PREVIEW_MAX_HEIGHT = 440/)
assert.match(handlers, /thumbnailDataUrl: thumbnail\.toDataURL\(\)/)
assert.match(diffPanel, /hasPersistedAssistantBrowserWorkspaceState/)
assert.match(diffPanel, /restoredBrowserTabs/)
assert.match(diffPanel, /setWorkspaceTabs\(\[REVIEW_TAB, \.\.\.restoredBrowserTabs\]\)/)
assert.match(viewportState, /iPhone 14 Pro Max/)
assert.match(viewportState, /Samsung Galaxy S20 Ultra/)
assert.match(viewportState, /Nest Hub Max/)

assert.deepEqual(normalizeAssistantBrowserViewport({ mode: 'fill' }), { mode: 'fill' })
assert.deepEqual(normalizeAssistantBrowserViewport({
    mode: 'preset', presetId: 'iphone-12-pro', width: 390, height: 844, aspectRatio: null
}), {
    mode: 'preset', presetId: 'iphone-12-pro', width: 390, height: 844, aspectRatio: null
})
assert.equal(normalizeAssistantBrowserZoom(9), 2)
assert.equal(normalizeAssistantBrowserZoom(0), 0.25)
assert.deepEqual(clampAssistantBrowserViewportSize(100, 9_000), { width: 240, height: 2560 })

const layout = resolveAssistantBrowserViewportLayout(
    { width: 900, height: 700 },
    { mode: 'preset', presetId: 'iphone-12-pro', width: 390, height: 844, aspectRatio: null },
    1
)
assert.equal(layout.fillsPanel, false)
assert.ok(layout.scale > 0 && layout.scale <= 1)
assert.ok(layout.x >= 10)
assert.ok(layout.visibleWidth <= 880)
assert.ok(layout.visibleHeight <= 690)
const zoomedLayout = resolveAssistantBrowserViewportLayout(
    { width: 900, height: 700 },
    { mode: 'preset', presetId: 'iphone-12-pro', width: 390, height: 844, aspectRatio: null },
    1.5
)
assert.deepEqual(
    [zoomedLayout.visibleWidth, zoomedLayout.visibleHeight],
    [layout.visibleWidth, layout.visibleHeight],
    'Electron page zoom does not resize the requested device frame'
)

const ratioResize = resizeAssistantBrowserViewport(
    { width: 800, height: 600 },
    { x: 160, y: 0 },
    'east',
    1,
    4 / 3
)
assert.equal(Math.round((ratioResize.width / ratioResize.height) * 100), 133)

console.log('Browser developer suite contract: ok')
