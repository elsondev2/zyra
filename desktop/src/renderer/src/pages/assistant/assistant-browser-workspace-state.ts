export type AssistantBrowserTabStatus = 'idle' | 'loading' | 'ready' | 'error'

export type AssistantBrowserTabState = {
    id: string
    url: string
    title: string
    status: AssistantBrowserTabStatus
    error: string | null
    canGoBack: boolean
    canGoForward: boolean
    audible: boolean
    faviconUrl: string | null
    updatedAt: number
}

export type AssistantBrowserWorkspaceState = {
    version: 1
    activeTabId: string
    splitTabId: string | null
    tabs: AssistantBrowserTabState[]
}

export type AssistantBrowserNavigationResult =
    | { success: true; url: string }
    | { success: false; error: string }

export const ASSISTANT_BROWSER_TAB_LIMIT = 8
const ASSISTANT_BROWSER_STORAGE_KEY = 'zyra:assistant-browser-workspaces:v1'
const ASSISTANT_BROWSER_WORKSPACE_LIMIT = 20
const ASSISTANT_BROWSER_URL_LIMIT = 2048
const ASSISTANT_BROWSER_FAVICON_URL_LIMIT = 8192

export function createAssistantBrowserTab(id: string, url = ''): AssistantBrowserTabState {
    const normalizedUrl = url.trim()
    return {
        id,
        url: normalizedUrl,
        title: normalizedUrl ? browserTabFallbackTitle(normalizedUrl) : 'New tab',
        status: normalizedUrl ? 'loading' : 'idle',
        error: null,
        canGoBack: false,
        canGoForward: false,
        audible: false,
        faviconUrl: null,
        updatedAt: Date.now()
    }
}

export function createAssistantBrowserWorkspaceState(tabId = 'browser:0'): AssistantBrowserWorkspaceState {
    return {
        version: 1,
        activeTabId: tabId,
        splitTabId: null,
        tabs: [createAssistantBrowserTab(tabId)]
    }
}

export function addAssistantBrowserTab(
    state: AssistantBrowserWorkspaceState,
    tabId: string,
    url = ''
): AssistantBrowserWorkspaceState {
    if (!tabId || state.tabs.some((tab) => tab.id === tabId)) {
        return state.tabs.some((tab) => tab.id === tabId)
            ? { ...state, activeTabId: tabId }
            : state
    }
    if (state.tabs.length >= ASSISTANT_BROWSER_TAB_LIMIT) return state
    return {
        ...state,
        version: 1,
        activeTabId: tabId,
        tabs: [...state.tabs, createAssistantBrowserTab(tabId, url)]
    }
}

export function activateAssistantBrowserTab(
    state: AssistantBrowserWorkspaceState,
    tabId: string
): AssistantBrowserWorkspaceState {
    if (!state.tabs.some((tab) => tab.id === tabId) || state.activeTabId === tabId) return state
    if (state.splitTabId === tabId) {
        return { ...state, activeTabId: tabId, splitTabId: state.activeTabId }
    }
    return { ...state, activeTabId: tabId }
}

export function setAssistantBrowserLayout(
    state: AssistantBrowserWorkspaceState,
    primaryTabId: string,
    secondaryTabId: string | null
): AssistantBrowserWorkspaceState {
    if (!state.tabs.some((tab) => tab.id === primaryTabId)) return state
    const splitTabId = secondaryTabId
        && secondaryTabId !== primaryTabId
        && state.tabs.some((tab) => tab.id === secondaryTabId)
        ? secondaryTabId
        : null
    if (state.activeTabId === primaryTabId && state.splitTabId === splitTabId) return state
    return { ...state, activeTabId: primaryTabId, splitTabId }
}

export function updateAssistantBrowserTab(
    state: AssistantBrowserWorkspaceState,
    tabId: string,
    patch: Partial<Omit<AssistantBrowserTabState, 'id'>>
): AssistantBrowserWorkspaceState {
    const index = state.tabs.findIndex((tab) => tab.id === tabId)
    if (index < 0) return state
    const current = state.tabs[index]
    const nextTab: AssistantBrowserTabState = {
        ...current,
        ...patch,
        id: current.id,
        updatedAt: Number.isFinite(patch.updatedAt) ? Number(patch.updatedAt) : Date.now()
    }
    if (
        current.url === nextTab.url
        && current.title === nextTab.title
        && current.status === nextTab.status
        && current.error === nextTab.error
        && current.canGoBack === nextTab.canGoBack
        && current.canGoForward === nextTab.canGoForward
        && current.audible === nextTab.audible
        && current.faviconUrl === nextTab.faviconUrl
    ) return state
    const tabs = state.tabs.slice()
    tabs[index] = nextTab
    return { ...state, tabs }
}

export function closeAssistantBrowserTab(
    state: AssistantBrowserWorkspaceState,
    tabId: string,
    replacementTabId: string
): AssistantBrowserWorkspaceState {
    const closingIndex = state.tabs.findIndex((tab) => tab.id === tabId)
    if (closingIndex < 0) return state
    const tabs = state.tabs.filter((tab) => tab.id !== tabId)
    if (tabs.length === 0) return createAssistantBrowserWorkspaceState(replacementTabId)
    if (state.splitTabId === tabId) return { ...state, splitTabId: null, tabs }
    if (state.activeTabId !== tabId) return { ...state, tabs }
    if (state.splitTabId && tabs.some((tab) => tab.id === state.splitTabId)) {
        return { ...state, activeTabId: state.splitTabId, splitTabId: null, tabs }
    }
    const fallback = tabs[Math.min(closingIndex, tabs.length - 1)] || tabs[0]
    return { ...state, activeTabId: fallback.id, splitTabId: null, tabs }
}

export function normalizeAssistantBrowserWorkspaceState(
    candidate: unknown,
    fallbackTabId = 'browser:0'
): AssistantBrowserWorkspaceState {
    if (!candidate || typeof candidate !== 'object') return createAssistantBrowserWorkspaceState(fallbackTabId)
    const input = candidate as Partial<AssistantBrowserWorkspaceState>
    const seen = new Set<string>()
    const tabs = (Array.isArray(input.tabs) ? input.tabs : [])
        .flatMap((entry): AssistantBrowserTabState[] => {
            if (!entry || typeof entry !== 'object') return []
            const tab = entry as Partial<AssistantBrowserTabState>
            const id = String(tab.id || '').trim().slice(0, 128)
            if (!id || seen.has(id)) return []
            seen.add(id)
            const rawUrl = String(tab.url || '').trim().slice(0, ASSISTANT_BROWSER_URL_LIMIT)
            const url = rawUrl && isSafeAssistantBrowserUrl(rawUrl) ? rawUrl : ''
            const rawTitle = String(tab.title || '').trim().slice(0, 256)
            return [{
                id,
                url,
                title: rawTitle || (url ? browserTabFallbackTitle(url) : 'New tab'),
                status: 'idle',
                error: null,
                canGoBack: false,
                canGoForward: false,
                audible: false,
                faviconUrl: normalizeAssistantBrowserFaviconUrl(tab.faviconUrl),
                updatedAt: Number.isFinite(tab.updatedAt) ? Number(tab.updatedAt) : Date.now()
            }]
        })
        .slice(0, ASSISTANT_BROWSER_TAB_LIMIT)
    if (tabs.length === 0) return createAssistantBrowserWorkspaceState(fallbackTabId)
    const requestedActiveTabId = String(input.activeTabId || '')
    const activeTabId = tabs.some((tab) => tab.id === requestedActiveTabId) ? requestedActiveTabId : tabs[0].id
    const requestedSplitTabId = String(input.splitTabId || '')
    return {
        version: 1,
        activeTabId,
        splitTabId: requestedSplitTabId !== activeTabId && tabs.some((tab) => tab.id === requestedSplitTabId)
            ? requestedSplitTabId
            : null,
        tabs
    }
}

export function loadAssistantBrowserWorkspaceState(workspaceKey: string): AssistantBrowserWorkspaceState {
    if (!workspaceKey || typeof window === 'undefined') return createAssistantBrowserWorkspaceState()
    try {
        const stored = JSON.parse(localStorage.getItem(ASSISTANT_BROWSER_STORAGE_KEY) || '{}') as Record<string, unknown>
        return normalizeAssistantBrowserWorkspaceState(stored[workspaceKey])
    } catch {
        return createAssistantBrowserWorkspaceState()
    }
}

export function persistAssistantBrowserWorkspaceState(
    workspaceKey: string,
    state: AssistantBrowserWorkspaceState
): void {
    if (!workspaceKey || typeof window === 'undefined') return
    try {
        const stored = JSON.parse(localStorage.getItem(ASSISTANT_BROWSER_STORAGE_KEY) || '{}') as Record<string, unknown>
        const entries = Object.entries(stored).filter(([key]) => key !== workspaceKey)
        const bounded = entries.slice(Math.max(0, entries.length - ASSISTANT_BROWSER_WORKSPACE_LIMIT + 1))
        localStorage.setItem(ASSISTANT_BROWSER_STORAGE_KEY, JSON.stringify({
            ...Object.fromEntries(bounded),
            [workspaceKey]: state
        }))
    } catch {
        // Browser state is helpful continuity, never a reason to break navigation.
    }
}

export function normalizeAssistantBrowserFaviconUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const candidate = value.trim()
    if (!candidate || candidate.length > ASSISTANT_BROWSER_FAVICON_URL_LIMIT) return null
    if (/^data:image\/(?:png|gif|jpe?g|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(candidate)) {
        return candidate
    }
    try {
        const parsed = new URL(candidate)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
    } catch {
        return null
    }
}

export function isSafeAssistantBrowserUrl(value: string): boolean {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

export function normalizeAssistantBrowserNavigation(rawInput: string): AssistantBrowserNavigationResult {
    const trimmed = String(rawInput || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
    if (!trimmed) return { success: false, error: 'Enter an address or search.' }
    if (trimmed.length > ASSISTANT_BROWSER_URL_LIMIT) {
        return { success: false, error: `Address must be ${ASSISTANT_BROWSER_URL_LIMIT} characters or fewer.` }
    }

    const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?::\d{1,5})?(?:[/?#]|$)/i.test(trimmed)
    const localName = /^[a-z\d-]+\.local(?::\d{1,5})?(?:[/?#]|$)/i.test(trimmed)
    const hostnameWithPort = /^[a-z\d.-]+:\d{1,5}(?:[/?#]|$)/i.test(trimmed)
    const explicitScheme = trimmed.match(/^([a-z][a-z\d+.-]*):(?:\/\/)?/i)?.[1]?.toLowerCase()
    const schemeIsHostPort = hostnameWithPort || loopback || localName
    if (explicitScheme && !schemeIsHostPort && explicitScheme !== 'http' && explicitScheme !== 'https') {
        return { success: false, error: `Zyra Browser cannot open ${explicitScheme}: addresses.` }
    }

    const candidate = explicitScheme && !schemeIsHostPort
        ? trimmed
        : loopback || localName
            ? `http://${trimmed}`
            : /^[^\s/]+\.[^\s]+(?:[/?#].*)?$/i.test(trimmed)
                ? `https://${trimmed}`
                : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`

    try {
        const parsed = new URL(candidate)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { success: false, error: 'Only HTTP and HTTPS addresses are supported.' }
        }
        if (parsed.port) {
            const port = Number(parsed.port)
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                return { success: false, error: 'That port is outside the valid range.' }
            }
        }
        return { success: true, url: parsed.toString() }
    } catch {
        return { success: false, error: 'That address could not be understood.' }
    }
}

export function browserTabFallbackTitle(url: string): string {
    try {
        const parsed = new URL(url)
        return parsed.hostname || parsed.href
    } catch {
        return url || 'New tab'
    }
}
