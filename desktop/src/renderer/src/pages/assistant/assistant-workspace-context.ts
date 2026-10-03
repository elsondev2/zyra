import { createContext, useContext } from 'react'
import type { AssistantPaneLayout } from './assistant-pane-layout'
import type { useAssistantPageSidebarState } from './useAssistantPageSidebarState'

export type AssistantWorkspaceState = ReturnType<typeof useAssistantPageSidebarState> & { paneLayout: AssistantPaneLayout }

// A retained route/layout may still hold the previous provider during Fast
// Refresh. Consumers must keep the same context identity across module updates.
export const AssistantWorkspaceContext = import.meta.hot?.data.assistantWorkspaceContext
    ?? createContext<AssistantWorkspaceState | null>(null)
if (import.meta.hot) import.meta.hot.data.assistantWorkspaceContext = AssistantWorkspaceContext

export function useAssistantWorkspaceLayout(): AssistantWorkspaceState {
    const layout = useContext<AssistantWorkspaceState | null>(AssistantWorkspaceContext)
    if (!layout) throw new Error('Assistant pages require the shared workspace layout.')
    return layout
}
