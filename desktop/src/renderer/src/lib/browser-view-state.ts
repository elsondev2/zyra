import type { BrowserViewEvent, BrowserViewState } from '@shared/browser-view'

type StateEvent = Extract<BrowserViewEvent, { type: 'state' }>
const states = new Map<string, StateEvent>()
const listeners = new Set<(event: StateEvent) => void>()
let unsubscribe: (() => void) | undefined

/** Observe native pages from renderer startup, including while their chat is absent. */
export function startBrowserViewStateTracking(): void {
    if (unsubscribe || !window.devscope?.browserView?.onEvent) return
    unsubscribe = window.devscope.browserView.onEvent(event => {
        if (event.type !== 'state') return
        const previous = states.get(event.state.tabId)?.state
        if (previous && previous.guestWebContentsId === event.state.guestWebContentsId
            && previous.revision >= event.state.revision) return
        states.delete(event.state.tabId)
        states.set(event.state.tabId, event)
        // Native pages can outlive a workspace; keep a bounded, memory-only cache.
        if (states.size > 256) states.delete(states.keys().next().value!)
        for (const listener of listeners) listener(event)
    })
}

export function readBrowserViewState(tabId: string): BrowserViewState | undefined {
    return states.get(tabId)?.state
}

export function forgetBrowserViewState(tabId: string): void {
    states.delete(tabId)
}

export function subscribeBrowserViewState(listener: (event: StateEvent) => void): () => void {
    startBrowserViewStateTracking()
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export function browserViewStatePatch(state: BrowserViewState) {
    return {
        sessionMode: state.sessionMode, url: state.url, displayAddress: state.displayAddress,
        title: state.title, status: state.status, error: state.error,
        canGoBack: state.canGoBack, canGoForward: state.canGoForward,
        faviconUrl: state.faviconUrl, audible: state.audible
    }
}

if (import.meta.hot) import.meta.hot.dispose(() => {
    unsubscribe?.()
    unsubscribe = undefined
    states.clear()
    listeners.clear()
})
