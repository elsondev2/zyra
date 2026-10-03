import { useCallback, useState, type RefObject } from 'react'
import type { AssistantBrowserTabState, AssistantBrowserWorkspaceState } from './assistant-browser-workspace-state'

/** Browser reports supply metadata; explicit inspector actions own selection. */
export function useInspectorBrowserState(pendingBrowserTabIds: RefObject<Set<string>>) {
    const [browserTabs, setBrowserTabs] = useState<AssistantBrowserTabState[]>([])
    const [browserActiveTabId, setBrowserActiveTabId] = useState<string | null>(null)
    const handleBrowserTabsChange = useCallback((next: AssistantBrowserWorkspaceState) => {
        for (const tab of next.tabs) pendingBrowserTabIds.current.delete(tab.id)
        setBrowserTabs(next.tabs)
        setBrowserActiveTabId(next.activeTabId)
        // A passive report can belong to the render before a new selection.
        // Echoing its activeTabId into inspector selection makes the two renders
        // continuously select each other's previous tab.
    }, [pendingBrowserTabIds])
    return { browserTabs, setBrowserTabs, browserActiveTabId, setBrowserActiveTabId, handleBrowserTabsChange }
}
