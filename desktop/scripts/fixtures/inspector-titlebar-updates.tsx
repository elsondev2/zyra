import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AssistantInspectorSidebar, type AssistantInspectorTab } from '../../src/renderer/src/pages/assistant/AssistantInspectorSidebar'
import { AssistantInspectorFrame } from '../../src/renderer/src/pages/assistant/AssistantInspectorFrame'
import { AssistantTitleBarProvider, useAssistantTitleBarEndRegion } from '../../src/renderer/src/lib/assistant/assistant-title-bar'
import { RendererErrorBoundary } from '../../src/renderer/src/components/layout/RendererErrorBoundary'
import { AssistantBrowserWorkspace, type AssistantBrowserWorkspaceController } from '../../src/renderer/src/pages/assistant/AssistantBrowserWorkspace'
import { useInspectorBrowserState } from '../../src/renderer/src/pages/assistant/useInspectorBrowserState'
import type { BrowserViewEvent, BrowserViewState } from '../../src/shared/browser-view'
import { startBrowserViewStateTracking } from '../../src/renderer/src/lib/browser-view-state'

const noop = () => undefined
const bridge = new Proxy({}, { get: (_, name) => String(name).startsWith('on') ? () => noop : async () => ({ success: false, error: 'Fixture bridge' }) })
const browserListeners = new Set<(event: BrowserViewEvent) => void>()
const browserView = { close: async () => ({ success: true }), onEvent: (listener: (event: BrowserViewEvent) => void) => { browserListeners.add(listener); return () => browserListeners.delete(listener) } }
;(window as any).devscope = new Proxy({ assistantUtility: bridge, agentControl: bridge, window: bridge, browserView }, { get: (object, name) => {
    if (name === 'prepareNativeOverlay') return undefined
    if (name === 'getBrowserPreviewConfig') return async () => ({ success: true, partition: 'fixture', webPreferences: '', profileScope: 'global', persistent: true, protectedMedia: { ready: true, restartRequired: false } })
    return object[name as keyof typeof object] || (String(name).startsWith('on') ? () => noop : async () => ({ success: false, error: 'Fixture bridge' }))
} })
startBrowserViewStateTracking()
function reportBrowser(tabId: string, status: BrowserViewState['status'], revision: number) {
    const state: BrowserViewState = { version: 1, tabId, status, revision, guestWebContentsId: 100, sessionMode: 'normal', url: 'https://example.test/hidden', displayAddress: null, title: 'Background page', error: status === 'error' ? 'Load failed' : null, canGoBack: false, canGoForward: false, faviconUrl: null, audible: false, fullscreen: false }
    for (const listener of browserListeners) listener({ type: 'state', cause: 'navigation', state })
}
let update: (state: { width: number; tabs: AssistantInspectorTab[]; open: boolean }) => void
let selectBrowser: (id: string) => void
let presentBrowser: (visible: boolean) => void
let readBrowserState: () => { selection: string; active: string | null; ids: string[] }
let browserController: AssistantBrowserWorkspaceController | null = null
const receiveController = (controller: AssistantBrowserWorkspaceController | null) => { browserController = controller }
let publications = 0
function Header() {
    const region = useAssistantTitleBarEndRegion()
    publications++
    return <header style={{ display: 'flex', height: 34 }}>{region?.content}</header>
}
function Workspace() {
    const [state, setState] = useState<{ width: number; tabs: AssistantInspectorTab[]; open: boolean }>({ width: 420, tabs: [{ id: 'browser:a', label: 'Browser A' }], open: true })
    update = setState
    const [selection, setSelection] = useState('browser:a')
    const [browserPresented, setBrowserPresented] = useState(true)
    presentBrowser = setBrowserPresented
    selectBrowser = setSelection
    const pendingBrowserTabIds = useRef(new Set<string>())
    const { browserTabs, browserActiveTabId, handleBrowserTabsChange } = useInspectorBrowserState(pendingBrowserTabIds)
    readBrowserState = () => ({ selection, active: browserActiveTabId, ids: browserTabs.map(tab => tab.id) })
    useEffect(() => {
        setState(current => ({ ...current, tabs: browserTabs.map(tab => ({ id: tab.id, label: tab.title || tab.id, loading: tab.status === 'loading' })) }))
    }, [browserTabs])
    return <AssistantInspectorFrame open={state.open} width={state.width}>
        <AssistantInspectorSidebar {...state} maxWidth={1100} activeTabId={selection} onWidthChange={noop} onClose={noop} onSelectTab={setSelection} onCloseTab={noop} onReorderTab={noop} addTabItems={[]}>
            <AssistantBrowserWorkspace workspaceKey="fixture" threadId="fixture" projectPath="C:/fixture" active={state.open && browserPresented} selectedTabId={selection} controlState={null} navigationRequest={null} surfaceRequest={null} onNavigationRequestHandled={noop} onSurfaceRequestHandled={noop} onWorkspaceStateChange={noop} onTabsChange={handleBrowserTabsChange} onRequestTabSelection={setSelection} onControllerChange={receiveController} onDeveloperToast={noop} onOpenPreview={async () => undefined} persistState={false} />
        </AssistantInspectorSidebar>
    </AssistantInspectorFrame>
}
createRoot(document.getElementById('root')!).render(<StrictMode><RendererErrorBoundary><AssistantTitleBarProvider><Header /><Workspace /></AssistantTitleBarProvider></RendererErrorBoundary></StrictMode>)
const pause = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
;(window as any).inspectorUpdateCheck = (async () => {
    await pause(300)
    assert(!document.querySelector('[role="alert"]'), 'Initial inspector publication crashes')
    flushSync(() => {
        browserController!.createTab('https://example.test', { activate: false, tabId: 'browser:background' })
        selectBrowser('browser:new-selection')
    })
    await pause(300)
    assert(!document.querySelector('[role="alert"]'), 'Concurrent background tab and Browser selection crash the inspector')
    assert(readBrowserState().selection === 'browser:new-selection' && readBrowserState().active === 'browser:new-selection', 'The requested selection must win over the stale browser report')
    assert(readBrowserState().ids.includes('browser:background'), 'Background tab metadata must still reach the inspector')
    assert(document.querySelector('[data-inspector-tab-id="browser:new-selection"][role="tab"]')?.getAttribute('aria-selected') === 'true', 'Inspector must render the requested selected tab')
    flushSync(() => browserController!.createTab('https://example.test/hidden', { activate: false, tabId: 'browser:hidden' }))
    await pause(100)
    assert(readBrowserState().selection === 'browser:new-selection' && readBrowserState().active === 'browser:new-selection', 'A background tab must not change selection')
    const hiddenPillLoading = () => Boolean(document.querySelector('[data-inspector-tab-id="browser:hidden"][role="tab"] .inspector-tab-loading'))
    assert(hiddenPillLoading(), 'Background navigation must initially indicate loading')
    flushSync(() => reportBrowser('browser:hidden', 'ready', 2))
    await pause(100)
    assert(!hiddenPillLoading(), 'Background completion must clear the rendered pill without selecting or mounting its Webview')
    flushSync(() => reportBrowser('browser:hidden', 'loading', 1))
    await pause(100)
    assert(!hiddenPillLoading(), 'An older loading event must not revive the spinner')
    flushSync(() => reportBrowser('browser:hidden', 'loading', 3))
    await pause(100)
    assert(hiddenPillLoading(), 'A new background navigation must restart the spinner')
    flushSync(() => reportBrowser('browser:hidden', 'error', 4))
    await pause(100)
    assert(!hiddenPillLoading(), 'A failed background load must also stop spinning')
    assert(readBrowserState().selection === 'browser:new-selection', 'Background status updates must preserve selection')
    flushSync(() => reportBrowser('browser:cached', 'ready', 2))
    await pause(50)
    assert(!readBrowserState().ids.includes('browser:cached'), 'Native events must not add foreign tabs to this workspace')
    flushSync(() => browserController!.createTab('https://example.test/hidden', { activate: false, tabId: 'browser:cached' }))
    await pause(100)
    assert(!document.querySelector('[data-inspector-tab-id="browser:cached"][role="tab"] .inspector-tab-loading'), 'Completion before tab registration must be replayed without selection')
    flushSync(() => reportBrowser('browser:hidden', 'idle', 5))
    await pause(100)
    assert(!hiddenPillLoading(), 'An idle URL must not be presented as an active load')
    flushSync(() => browserController!.createTab('https://example.test/loading', { tabId: 'browser:loading-ui' }))
    await pause(100)
    const loadingStrip = () => document.querySelector('[class*="browser-loading-slide"]')
    assert(loadingStrip(), 'The visible browser must show its real loading strip')
    flushSync(() => presentBrowser(false))
    await pause(100)
    assert(!loadingStrip(), 'Background browser loading must not escape into the user-facing overlay')
    flushSync(() => presentBrowser(true))
    await pause(100)
    assert(loadingStrip(), 'Returning to the browser must restore its loading UI')
    flushSync(() => browserController!.createTab('', { tabId: 'browser:explicit' }))
    await pause(100)
    assert(readBrowserState().selection === 'browser:explicit' && readBrowserState().active === 'browser:explicit', 'Explicit browser selection must still reach the inspector')
    flushSync(() => {
        const next = browserController!.closeTab('browser:explicit')
        selectBrowser(next.activeTabId)
    })
    await pause(100)
    assert(!readBrowserState().ids.includes('browser:explicit') && readBrowserState().selection === readBrowserState().active, 'Closing the active tab must preserve fallback selection')
    flushSync(() => selectBrowser('browser:b'))
    await pause(300)
    assert(!document.querySelector('[role="alert"]'), 'Selecting another Browser tab loops through inspector state')
    for (let index = 0; index < 20; index++) {
        flushSync(() => {
            browserController!.createTab('https://example.test/background', { activate: false, tabId: `browser:background-${index}` })
            selectBrowser(index % 2 ? 'browser:b' : 'browser:new-selection')
            update({ width: index % 2 ? 900 : 420, tabs: readBrowserState().ids.map(id => ({ id, label: id })), open: true })
        })
        await pause(50)
        assert(!document.querySelector('[role="alert"]'), 'Browser tabs / inspector resize exceeds React update depth')
        assert(readBrowserState().selection === readBrowserState().active, 'Simultaneous updates must settle on one selection')
    }
    await pause(400)
    const before = publications
    await pause(400)
    assert(publications === before, `Title bar does not settle (${before} -> ${publications})`)
    return ['inspector mounts in StrictMode', 'simultaneous background tab and selection preserve the requested rendered selection', 'background metadata does not steal selection', 'unselected browser completion and failure clear the rendered loading pill', 'stale events cannot revive loading; fresh navigation can', 'cached completion reaches late tab registration without importing foreign tabs', 'idle URLs do not spin', 'inactive browser loading UI cannot escape into foreground overlays', 'explicit selection and close fallback remain wired', '20 concurrent browser and resize updates settle without update loops']
})()
