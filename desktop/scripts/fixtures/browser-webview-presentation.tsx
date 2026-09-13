import { createRef, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AssistantBrowserWebview, type AssistantBrowserWebviewHandle } from '../../src/renderer/src/pages/assistant/AssistantBrowserWebview'
import type { AssistantBrowserTabState } from '../../src/renderer/src/pages/assistant/assistant-browser-workspace-state'
import type { BrowserViewCommand, BrowserViewEvent, BrowserViewSlotInput, BrowserViewState } from '../../src/shared/browser-view'

const results: string[] = []
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate: () => boolean, message: string) {
    for (let index = 0; index < 100 && !predicate(); index++) await pause()
    check(predicate(), message)
}
const commands: BrowserViewCommand[] = []
const slots: BrowserViewSlotInput[] = []
const subscriptions = new Set<(event: BrowserViewEvent) => void>()
const releases: string[] = []
const ensured: string[] = []
const states = new Map<string, BrowserViewState>()
function stateFor(tabId: string): BrowserViewState {
    let state = states.get(tabId)
    if (!state) {
        state = { version: 1, revision: 1, tabId, sessionMode: 'normal', guestWebContentsId: states.size + 7,
            url: 'https://fixture.invalid/', displayAddress: null, title: 'Synthetic page', status: 'ready',
            error: null, canGoBack: true, canGoForward: false, faviconUrl: null, audible: false, fullscreen: false }
        states.set(tabId, state)
    }
    return state
}
let mediaRequests = 0
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getDisplayMedia: () => { mediaRequests++; throw new Error('Menus must not capture browser video') }
} })
;(window as any).devscope = {
    browserView: {
        ensure: async (input: { tabId: string }) => { ensured.push(input.tabId); return { success: true, created: true, state: stateFor(input.tabId) } },
        command: async (input: BrowserViewCommand) => { commands.push(input); return { success: true, accepted: true, state: stateFor(input.tabId) } },
        release: (tabId: string) => releases.push(tabId),
        reportSlot: (input: BrowserViewSlotInput) => slots.push(input),
        onEvent: (listener: (event: BrowserViewEvent) => void) => { subscriptions.add(listener); return () => subscriptions.delete(listener) }
    },
    agentControl: { bindBrowserTab: async () => ({ success: true, target: { targetId: 'fixture-control' } }) }
}
const container = document.getElementById('root')!
const layout = document.createElement('style')
layout.textContent = 'html,body{margin:0}#root{position:relative;width:480px;height:300px}[data-assistant-browser-view-slot]{position:absolute;inset:0;width:100%;height:100%}'
document.head.append(layout)
const root = createRoot(container)
const handle = createRef<AssistantBrowserWebviewHandle>()
const noop = () => {}
let tabId = 'native-tab:a'
function render(active: boolean, visible = true, url = 'https://fixture.invalid/') {
    const tab = { id: tabId, url, sessionMode: 'normal', status: 'ready', title: 'Fixture' } as AssistantBrowserTabState
    flushSync(() => root.render(<StrictMode><AssistantBrowserWebview key={tabId} ref={handle} tab={tab} threadId="fixture-thread" config={{} as any} active={active} visible={visible} placement="full" controlled={false} cursor={null} onStateChange={noop} onControlTargetChange={noop} onFullscreenChange={noop} onViewportRectChange={noop}/></StrictMode>))
}
const lastSlot = () => slots.filter(slot => slot.tabId === tabId).at(-1)
;(window as any).browserWebviewPresentationCheck = (async () => {
    render(true)
    await waitFor(() => Boolean(handle.current) && subscriptions.size === 1, 'real Webview mounts once under StrictMode')
    await pause(200)
    check(lastSlot()?.visible === true && lastSlot()?.active === true, 'loaded active native page is visible')
    const ensureCount = ensured.length
    const baseline = slots.length
    for (let cycle = 0; cycle < 8; cycle++) {
        // Old global DOM-occlusion detection must no longer hide the guest.
        // The native-host integration suite proves actual portal compositing.
        const overlay = document.createElement('div')
        overlay.setAttribute('aria-modal', 'true')
        overlay.dataset.zyraNativeViewOccluder = 'true'
        overlay.style.cssText = 'position:fixed;inset:0;z-index:130'
        document.body.append(overlay)
        await pause()
        overlay.style.opacity = '0'
        await pause()
        overlay.remove()
        await pause()
    }
    check(slots.slice(baseline).every(slot => slot.visible && slot.active), 'opening/closing/fading app UI never hides the native page')
    check(ensured.length === ensureCount, 'overlay cycles do not recreate or reacquire the browser guest')
    check(mediaRequests === 0 && !commands.some(command => command.type === 'capture'), 'no media capture or replacement snapshot during idle and overlay cycles')
    check(container.querySelectorAll('video,img').length === 0, 'no video or image replacement is mounted behind the browser')
    results.push('eight overlay cycles preserve the native page with zero capture, replacement elements or guest reacquisition')

    render(false, false)
    check(lastSlot()?.active === false && lastSlot()?.visible === false, 'inactive workspace releases visible native slot ownership')
    render(true)
    check(lastSlot()?.active === true && lastSlot()?.visible === true, 'reactivating restores the selected native page')
    render(true, false)
    check(lastSlot()?.visible === false, 'an explicitly hidden browser slot remains hidden')
    render(true, true, '')
    check(lastSlot()?.visible === false, 'New Tab hides blank Chromium so shell controls receive input')
    render(true)
    check(lastSlot()?.visible === true, 'returning to the loaded page restores native visibility')
    await handle.current!.navigate('https://fixture.invalid/second')
    check(commands.some(command => command.type === 'navigate' && command.url === 'https://fixture.invalid/second'), 'imperative navigation still reaches the owned browser')
    await handle.current!.showNewTab()
    check(commands.some(command => command.type === 'new-tab'), 'Home/New Tab still resets the native page')
    results.push('inactive, hidden, New Tab, restore and navigation behavior remain intact')

    const previousTab = tabId
    tabId = 'native-tab:b'
    render(true)
    await waitFor(() => ensured.includes(tabId) && subscriptions.size === 1, 'switching tabs attaches only the new event subscription')
    check(releases.includes(previousTab), 'previous tab releases its renderer lease')
    check(slots.filter(slot => slot.tabId === previousTab).at(-1)?.active === false, 'previous tab reports its inactive slot')
    const tabSlots = slots.filter(slot => slot.tabId === tabId)
    check(tabSlots.every((slot, index) => index === 0 || slot.revision > tabSlots[index - 1].revision), 'slot revisions remain strictly increasing')
    root.unmount()
    check(subscriptions.size === 0 && releases.includes(tabId), 'unmount releases the active lease and all event subscriptions')
    check(lastSlot()?.bounds === null && lastSlot()?.visible === false, 'unmount clears native geometry and visibility')
    results.push('tab switch and unmount clean up leases, subscriptions and native slot geometry')
    return results
})()
