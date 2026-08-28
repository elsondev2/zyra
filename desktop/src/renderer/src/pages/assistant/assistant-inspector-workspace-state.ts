export type AssistantInspectorWorkspaceTab =
    | { id: 'review'; kind: 'review' }
    | { id: 'explorer'; kind: 'explorer' }
    | { id: 'terminal'; kind: 'terminal' }
    | { id: string; kind: 'browser'; browserTabId: string }
    | { id: 'control'; kind: 'control' }
    | { id: 'resources'; kind: 'resources' }
    | { id: 'agents'; kind: 'agents' }
    | { id: string; kind: 'turn'; turnId: string }

export type AssistantInspectorWorkspaceState = {
    version: 1
    activeTabId: string
    tabs: AssistantInspectorWorkspaceTab[]
}

const ASSISTANT_INSPECTOR_STORAGE_KEY = 'zyra:assistant-inspector-workspaces:v1'
const ASSISTANT_INSPECTOR_WORKSPACE_LIMIT = 20
const ASSISTANT_INSPECTOR_TAB_LIMIT = 32
const ASSISTANT_INSPECTOR_ID_LIMIT = 192
const SINGLETON_TABS = {
    review: { id: 'review', kind: 'review' },
    explorer: { id: 'explorer', kind: 'explorer' },
    terminal: { id: 'terminal', kind: 'terminal' },
    control: { id: 'control', kind: 'control' },
    resources: { id: 'resources', kind: 'resources' },
    agents: { id: 'agents', kind: 'agents' }
} as const

export function reorderAssistantInspectorWorkspaceTabs(
    tabs: AssistantInspectorWorkspaceTab[],
    draggedTabId: string,
    targetTabId: string
): AssistantInspectorWorkspaceTab[] {
    const fromIndex = tabs.findIndex((tab) => tab.id === draggedTabId)
    const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId)
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return tabs
    const next = tabs.slice()
    const [draggedTab] = next.splice(fromIndex, 1)
    next.splice(targetIndex, 0, draggedTab)
    return next
}

export function reconcileAssistantInspectorBrowserTabs(
    tabs: AssistantInspectorWorkspaceTab[],
    browserTabIds: readonly string[],
    pendingBrowserTabIds: readonly string[] = []
): AssistantInspectorWorkspaceTab[] {
    const orderedBrowserIds = [...new Set(browserTabIds.filter((id) => id.startsWith('browser:')))]
    const validBrowserIds = new Set([...orderedBrowserIds, ...pendingBrowserTabIds.filter((id) => id.startsWith('browser:'))])
    const next = tabs.filter((tab) => tab.kind !== 'browser' || validBrowserIds.has(tab.browserTabId))
    const retainedIds = new Set(next.filter((tab) => tab.kind === 'browser').map((tab) => tab.browserTabId))

    for (let browserIndex = 0; browserIndex < orderedBrowserIds.length; browserIndex += 1) {
        const browserTabId = orderedBrowserIds[browserIndex]
        if (retainedIds.has(browserTabId) || next.length >= ASSISTANT_INSPECTOR_TAB_LIMIT) continue
        let insertionIndex = next.length
        for (let previousIndex = browserIndex - 1; previousIndex >= 0; previousIndex -= 1) {
            const previousPosition = next.findIndex((tab) => tab.kind === 'browser' && tab.browserTabId === orderedBrowserIds[previousIndex])
            if (previousPosition >= 0) {
                insertionIndex = previousPosition + 1
                break
            }
        }
        if (insertionIndex === next.length) {
            for (let followingIndex = browserIndex + 1; followingIndex < orderedBrowserIds.length; followingIndex += 1) {
                const followingPosition = next.findIndex((tab) => tab.kind === 'browser' && tab.browserTabId === orderedBrowserIds[followingIndex])
                if (followingPosition >= 0) {
                    insertionIndex = followingPosition
                    break
                }
            }
        }
        next.splice(insertionIndex, 0, { id: browserTabId, kind: 'browser', browserTabId })
        retainedIds.add(browserTabId)
    }

    return next.length === tabs.length && next.every((tab, index) => tab.id === tabs[index]?.id) ? tabs : next
}

export function ensureAssistantInspectorBrowserTab(
    tabs: AssistantInspectorWorkspaceTab[],
    browserTabId: string
): AssistantInspectorWorkspaceTab[] {
    if (!browserTabId.startsWith('browser:') || tabs.some((tab) => tab.id === browserTabId)) return tabs
    if (tabs.length >= ASSISTANT_INSPECTOR_TAB_LIMIT) return tabs
    return [...tabs, { id: browserTabId, kind: 'browser', browserTabId }]
}

function normalizeTab(candidate: unknown): AssistantInspectorWorkspaceTab | null {
    if (!candidate || typeof candidate !== 'object') return null
    const input = candidate as Record<string, unknown>
    const kind = String(input['kind'] || '')
    if (kind in SINGLETON_TABS) return SINGLETON_TABS[kind as keyof typeof SINGLETON_TABS]

    if (kind === 'browser') {
        const browserTabId = String(input['browserTabId'] || input['id'] || '').trim().slice(0, ASSISTANT_INSPECTOR_ID_LIMIT)
        if (!browserTabId.startsWith('browser:')) return null
        return { id: browserTabId, kind: 'browser', browserTabId }
    }

    if (kind === 'turn') {
        const turnId = String(input['turnId'] || '').trim().slice(0, ASSISTANT_INSPECTOR_ID_LIMIT)
        if (!turnId) return null
        return { id: `turn:${turnId}`, kind: 'turn', turnId }
    }

    return null
}

export function normalizeAssistantInspectorWorkspaceState(candidate: unknown): AssistantInspectorWorkspaceState | null {
    if (!candidate || typeof candidate !== 'object') return null
    const input = candidate as Record<string, unknown>
    const seen = new Set<string>()
    const tabs = (Array.isArray(input['tabs']) ? input['tabs'] : []).flatMap((entry) => {
        const tab = normalizeTab(entry)
        if (!tab || seen.has(tab.id)) return []
        seen.add(tab.id)
        return [tab]
    }).slice(0, ASSISTANT_INSPECTOR_TAB_LIMIT)
    const requestedActiveTabId = String(input['activeTabId'] || '').trim().slice(0, ASSISTANT_INSPECTOR_ID_LIMIT)
    return {
        version: 1,
        activeTabId: tabs.some((tab) => tab.id === requestedActiveTabId) ? requestedActiveTabId : (tabs[0]?.id || ''),
        tabs
    }
}

export function restoreAssistantInspectorWorkspaceState(
    persisted: AssistantInspectorWorkspaceState | null,
    browserTabIds: string[]
): AssistantInspectorWorkspaceState {
    const validBrowserTabIds = [...new Set(browserTabIds.filter((id) => id.startsWith('browser:')).slice(0, ASSISTANT_INSPECTOR_TAB_LIMIT))]
    if (!persisted) {
        const tabs: AssistantInspectorWorkspaceTab[] = [
            SINGLETON_TABS.review,
            ...validBrowserTabIds.map((browserTabId): AssistantInspectorWorkspaceTab => ({ id: browserTabId, kind: 'browser', browserTabId }))
        ]
        return { version: 1, activeTabId: 'review', tabs }
    }

    const validBrowserSet = new Set(validBrowserTabIds)
    const tabs = persisted.tabs.filter((tab) => tab.kind !== 'browser' || validBrowserSet.has(tab.browserTabId))
    const retainedIds = new Set(tabs.map((tab) => tab.id))
    for (const browserTabId of validBrowserTabIds) {
        if (retainedIds.has(browserTabId) || tabs.length >= ASSISTANT_INSPECTOR_TAB_LIMIT) continue
        tabs.push({ id: browserTabId, kind: 'browser', browserTabId })
        retainedIds.add(browserTabId)
    }
    if (!tabs.length) tabs.push(SINGLETON_TABS.review)
    return {
        version: 1,
        activeTabId: tabs.some((tab) => tab.id === persisted.activeTabId) ? persisted.activeTabId : tabs[0].id,
        tabs
    }
}

export function loadAssistantInspectorWorkspaceState(workspaceKey: string): AssistantInspectorWorkspaceState | null {
    if (!workspaceKey || typeof window === 'undefined') return null
    try {
        const stored = JSON.parse(localStorage.getItem(ASSISTANT_INSPECTOR_STORAGE_KEY) || '{}') as Record<string, unknown>
        return normalizeAssistantInspectorWorkspaceState(stored[workspaceKey])
    } catch {
        return null
    }
}

export function persistAssistantInspectorWorkspaceState(
    workspaceKey: string,
    state: AssistantInspectorWorkspaceState
): void {
    if (!workspaceKey || typeof window === 'undefined') return
    const normalized = normalizeAssistantInspectorWorkspaceState(state)
    if (!normalized) return
    try {
        const stored = JSON.parse(localStorage.getItem(ASSISTANT_INSPECTOR_STORAGE_KEY) || '{}') as Record<string, unknown>
        const retained = Object.entries(stored).filter(([key]) => key !== workspaceKey)
        const bounded = retained.slice(Math.max(0, retained.length - ASSISTANT_INSPECTOR_WORKSPACE_LIMIT + 1))
        localStorage.setItem(ASSISTANT_INSPECTOR_STORAGE_KEY, JSON.stringify({
            ...Object.fromEntries(bounded),
            [workspaceKey]: normalized
        }))
    } catch {
        // Inspector continuity must never prevent the workspace from opening.
    }
}
