import type { DevScopeBrowserHistoryEntry, DevScopeBrowserHistoryRecordInput } from '@shared/contracts/devscope-api'
import { isSafeAssistantBrowserUrl, type AssistantBrowserTabState } from './assistant-browser-workspace-state'

const RENDERER_BROWSER_HISTORY_LIMIT = 50

export type AssistantBrowserProfileReloadHistoryPhase = 'awaiting-start' | 'loading' | 'settled'

export function transitionAssistantBrowserProfileReloadHistory(
    phase: AssistantBrowserProfileReloadHistoryPhase | undefined,
    status: AssistantBrowserTabState['status'] | undefined,
    historyRecord: DevScopeBrowserHistoryRecordInput | null
): { nextPhase: AssistantBrowserProfileReloadHistoryPhase | undefined; suppressRecord: boolean } {
    let nextPhase = phase
    if (status === 'loading' && nextPhase) {
        nextPhase = nextPhase === 'settled' ? undefined : 'loading'
    }
    if (historyRecord && historyRecord.incrementVisit !== false && nextPhase === 'settled') {
        nextPhase = undefined
    }
    const suppressRecord = Boolean(historyRecord && nextPhase)
    if ((status === 'ready' || status === 'error') && nextPhase) nextPhase = 'settled'
    return { nextPhase, suppressRecord }
}

export function resolveAssistantBrowserHistoryRecord(
    previous: AssistantBrowserTabState | undefined,
    patch: Partial<Omit<AssistantBrowserTabState, 'id'>>
): DevScopeBrowserHistoryRecordInput | null {
    const url = patch.url ?? previous?.url ?? ''
    if (!url || !isSafeAssistantBrowserUrl(url)) return null
    const title = patch.title ?? previous?.title ?? ''
    const faviconUrl = patch.faviconUrl === undefined ? previous?.faviconUrl || null : patch.faviconUrl
    const completedNavigation = patch.status === 'ready' && previous?.status !== 'ready'
    const completedInPageNavigation = Boolean(
        patch.url
        && patch.url !== previous?.url
        && previous?.status === 'ready'
        && patch.status !== 'loading'
        && patch.status !== 'error'
    )
    if (completedNavigation || completedInPageNavigation) return { url, title, faviconUrl }
    if (previous?.status === 'ready' && (patch.title !== undefined || patch.faviconUrl !== undefined)) {
        return { url, title, faviconUrl, incrementVisit: false }
    }
    return null
}

export function mergeAssistantBrowserHistoryEntry(
    entries: DevScopeBrowserHistoryEntry[],
    entry: DevScopeBrowserHistoryEntry
): DevScopeBrowserHistoryEntry[] {
    const existing = entries.find((candidate) => candidate.url === entry.url)
    const resolved = existing && existing.lastVisitedAt > entry.lastVisitedAt ? existing : entry
    return [resolved, ...entries.filter((candidate) => candidate.url !== entry.url)]
        .sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt))
        .slice(0, RENDERER_BROWSER_HISTORY_LIMIT)
}

export function resolveAssistantBrowserHistoryActiveIndex(
    current: number,
    key: 'ArrowDown' | 'ArrowUp',
    entryCount: number
): number {
    if (entryCount <= 0) return -1
    if (key === 'ArrowDown') return Math.min(entryCount - 1, current + 1)
    return current <= 0 ? entryCount - 1 : current - 1
}

export function resolveAssistantBrowserOmniboxActiveDescendant(
    listboxId: string,
    activeIndex: number,
    suggestions: AssistantBrowserOmniboxSuggestion[]
): string | undefined {
    if (activeIndex < 0 || !suggestions[activeIndex]) return undefined
    return `${listboxId}-option-${activeIndex}`
}

export function resolveAssistantBrowserOmniboxKeyboardAction(
    current: number,
    key: string,
    suggestions: AssistantBrowserOmniboxSuggestion[]
): { handled: boolean; activeIndex: number; navigateValue: string | null } {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
        return {
            handled: suggestions.length > 0,
            activeIndex: resolveAssistantBrowserHistoryActiveIndex(current, key, suggestions.length),
            navigateValue: null
        }
    }
    if (key === 'Enter' && current >= 0 && suggestions[current]) {
        return { handled: true, activeIndex: current, navigateValue: suggestions[current].value }
    }
    return { handled: false, activeIndex: current, navigateValue: null }
}

export function resolveAssistantBrowserHistoryKeyboardAction(
    current: number,
    key: string,
    entries: DevScopeBrowserHistoryEntry[]
): { handled: boolean; activeIndex: number; navigateUrl: string | null } {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
        return {
            handled: entries.length > 0,
            activeIndex: resolveAssistantBrowserHistoryActiveIndex(current, key, entries.length),
            navigateUrl: null
        }
    }
    if (key === 'Enter' && current >= 0 && entries[current]) {
        return { handled: true, activeIndex: current, navigateUrl: entries[current].url }
    }
    return { handled: false, activeIndex: current, navigateUrl: null }
}

export function filterAssistantBrowserHistory(
    entries: DevScopeBrowserHistoryEntry[],
    query: string,
    limit = 8
): DevScopeBrowserHistoryEntry[] {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit) || 8))
    const candidates = normalizedQuery
        ? entries.filter((entry) => entry.title.toLowerCase().includes(normalizedQuery) || entry.url.toLowerCase().includes(normalizedQuery))
        : entries
    return candidates.slice(0, boundedLimit)
}

export type AssistantBrowserOmniboxSuggestion = {
    id: string
    kind: 'search' | 'history'
    value: string
    label: string
    detail: string
    faviconUrl: string | null
}

export type AssistantBrowserHistorySiteCluster = {
    id: string
    origin: string
    hostname: string
    title: string
    url: string
    faviconUrl: string | null
    lastVisitedAt: string
    visitCount: number
    pageCount: number
    pages: DevScopeBrowserHistoryEntry[]
}

export type AssistantBrowserHistoryDayGroup = {
    id: string
    label: string
    clusters: AssistantBrowserHistorySiteCluster[]
}

function historyOrigin(entry: DevScopeBrowserHistoryEntry): { origin: string; hostname: string } {
    try {
        const url = new URL(entry.url)
        return { origin: url.origin, hostname: url.hostname }
    } catch {
        return { origin: entry.url, hostname: entry.url }
    }
}

export function clusterAssistantBrowserHistoryBySite(
    entries: DevScopeBrowserHistoryEntry[],
    limit = 20
): AssistantBrowserHistorySiteCluster[] {
    const clusters = new Map<string, AssistantBrowserHistorySiteCluster>()
    for (const entry of entries) {
        const { origin, hostname } = historyOrigin(entry)
        const existing = clusters.get(origin)
        if (existing) {
            existing.visitCount += entry.visitCount
            existing.pageCount += 1
            if (existing.pages.length < 20) existing.pages.push(entry)
            continue
        }
        clusters.set(origin, {
            id: origin,
            origin,
            hostname,
            title: entry.title || hostname,
            url: entry.url,
            faviconUrl: entry.faviconUrl,
            lastVisitedAt: entry.lastVisitedAt,
            visitCount: entry.visitCount,
            pageCount: 1,
            pages: [entry]
        })
    }
    return [...clusters.values()]
        .sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt))
        .slice(0, Math.max(1, Math.min(50, Math.floor(limit) || 20)))
}

function historyPeriod(timestamp: string, now: Date): { id: string; label: string; order: number } {
    const date = new Date(timestamp)
    if (!Number.isFinite(date.getTime())) return { id: 'earlier', label: 'Earlier', order: 3 }
    const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
    const visitedDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
    const dayDifference = Math.max(0, Math.floor(currentDay - visitedDay))
    if (dayDifference === 0) return { id: 'today', label: 'Today', order: 0 }
    if (dayDifference === 1) return { id: 'yesterday', label: 'Yesterday', order: 1 }
    if (dayDifference <= 7) return { id: 'previous-week', label: 'Previous 7 days', order: 2 }
    return { id: 'earlier', label: 'Earlier', order: 3 }
}

export function buildAssistantBrowserOmniboxSuggestions(
    googleSuggestions: string[],
    historyEntries: DevScopeBrowserHistoryEntry[],
    limit = 8
): AssistantBrowserOmniboxSuggestion[] {
    const resolved: AssistantBrowserOmniboxSuggestion[] = []
    for (const cluster of clusterAssistantBrowserHistoryBySite(historyEntries, 3)) {
        resolved.push({
            id: `history:${cluster.id}`,
            kind: 'history',
            value: cluster.url,
            label: cluster.title,
            detail: `${cluster.hostname} · ${cluster.pageCount} page${cluster.pageCount === 1 ? '' : 's'}`,
            faviconUrl: cluster.faviconUrl
        })
    }
    const existingLabels = new Set(resolved.map((entry) => entry.label.toLowerCase()))
    for (const suggestion of googleSuggestions) {
        if (resolved.length >= limit) break
        if (existingLabels.has(suggestion.toLowerCase())) continue
        resolved.push({
            id: `search:${suggestion.toLowerCase()}`,
            kind: 'search',
            value: suggestion,
            label: suggestion,
            detail: 'Google suggestion',
            faviconUrl: null
        })
    }
    return resolved.slice(0, Math.max(1, Math.min(12, Math.floor(limit) || 8)))
}

export function groupAssistantBrowserHistoryByDay(
    entries: DevScopeBrowserHistoryEntry[],
    now = new Date()
): AssistantBrowserHistoryDayGroup[] {
    const periods = new Map<string, { label: string; order: number; entries: DevScopeBrowserHistoryEntry[] }>()
    for (const entry of entries) {
        const period = historyPeriod(entry.lastVisitedAt, now)
        const group = periods.get(period.id) || { label: period.label, order: period.order, entries: [] }
        group.entries.push(entry)
        periods.set(period.id, group)
    }
    return [...periods.entries()]
        .sort(([, left], [, right]) => left.order - right.order)
        .map(([id, group]) => ({
            id,
            label: group.label,
            clusters: clusterAssistantBrowserHistoryBySite(group.entries, 50)
        }))
}

export function formatAssistantBrowserHistoryLocation(url: string): string {
    try {
        const parsed = new URL(url)
        return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname === '/' ? '' : parsed.pathname}`
    } catch {
        return url
    }
}
