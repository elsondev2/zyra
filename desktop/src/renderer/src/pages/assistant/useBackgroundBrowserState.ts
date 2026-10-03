import { useEffect, useRef, type RefObject } from 'react'
import { browserViewStatePatch, readBrowserViewState, subscribeBrowserViewState } from '@/lib/browser-view-state'
import type { BrowserViewState } from '@shared/browser-view'
import type { AssistantBrowserTabState } from './assistant-browser-workspace-state'

/** Lazy view mounting must not delay native page metadata or loading completion. */
export function useBackgroundBrowserState(
    tabs: AssistantBrowserTabState[],
    mountedTabIds: RefObject<Set<string>>,
    onStateChange: (tabId: string, patch: Partial<Omit<AssistantBrowserTabState, 'id'>>, options?: { suppressHistory?: boolean }) => void
) {
    const current = useRef({ tabs, onStateChange })
    const applied = useRef(new Map<string, BrowserViewState>())
    current.current = { tabs, onStateChange }
    const tabIds = JSON.stringify(tabs.map(tab => tab.id))
    useEffect(() => {
        const apply = (state: BrowserViewState, suppressHistory: boolean) => {
            // Mounted views already report state and history through their own lifecycle.
            if (mountedTabIds.current.has(state.tabId) || !current.current.tabs.some(tab => tab.id === state.tabId)) return
            if (applied.current.get(state.tabId) === state) return
            applied.current.set(state.tabId, state)
            current.current.onStateChange(state.tabId, browserViewStatePatch(state), { suppressHistory })
        }
        for (const id of applied.current.keys()) {
            if (!current.current.tabs.some(tab => tab.id === id)) applied.current.delete(id)
        }
        const unsubscribe = subscribeBrowserViewState(event => apply(event.state, event.cause === 'snapshot' || event.cause === 'ownership'))
        for (const tab of current.current.tabs) {
            const state = readBrowserViewState(tab.id)
            if (state) apply(state, true)
        }
        return unsubscribe
    }, [mountedTabIds, tabIds])
}
