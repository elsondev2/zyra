import { isSensitiveBrowserHistoryQueryKey } from './browser-history-store'

const GOOGLE_SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search'
const SEARCH_SUGGESTION_LIMIT = 8
const SEARCH_QUERY_LIMIT = 256
const REMOTE_RESPONSE_LIMIT = 128 * 1024
const SEARCH_CACHE_LIMIT = 100
const SEARCH_CACHE_TTL_MS = 5 * 60_000

type SearchCacheEntry = { expiresAt: number; suggestions: string[] }
const searchCache = new Map<string, SearchCacheEntry>()

async function readBoundedResponse(response: Response, limit = REMOTE_RESPONSE_LIMIT): Promise<string> {
    if (!response.ok) throw new Error(`Remote service returned ${response.status}.`)
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > limit) throw new Error('Remote response is too large.')
    const reader = response.body?.getReader()
    if (!reader) return (await response.text()).slice(0, limit)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        size += value.byteLength
        if (size > limit) {
            await reader.cancel().catch(() => undefined)
            throw new Error('Remote response is too large.')
        }
        chunks.push(value)
    }
    const merged = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
    }
    return new TextDecoder().decode(merged)
}

export function isEligibleGoogleBrowserSuggestionQuery(value: string): boolean {
    const query = String(value || '').trim()
    if (query.length < 2 || query.length > SEARCH_QUERY_LIMIT) return false
    if (/^(?:https?:\/\/|localhost(?::|\/|$)|127(?:\.\d{1,3}){3}(?::|\/|$)|\[?::1\]?(?::|\/|$)|[a-z]:[\\/]|[/~])/i.test(query)) return false
    if (!/\s/.test(query) && /^[^\s]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(query)) return false
    for (const match of query.matchAll(/(?:^|[?&\s])([^=\s?&]+)=/g)) {
        if (isSensitiveBrowserHistoryQueryKey(match[1])) return false
    }
    return true
}

function normalizeSuggestion(value: unknown): string | null {
    const suggestion = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_LIMIT)
    return suggestion ? suggestion : null
}

export async function fetchGoogleBrowserSearchSuggestions(rawQuery: string): Promise<string[]> {
    const query = normalizeSuggestion(rawQuery)
    if (!query || !isEligibleGoogleBrowserSuggestionQuery(query)) return []
    const cacheKey = query.toLowerCase()
    const cached = searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
        searchCache.delete(cacheKey)
        searchCache.set(cacheKey, cached)
        return cached.suggestions.slice()
    }
    if (cached) searchCache.delete(cacheKey)

    const url = new URL(GOOGLE_SUGGEST_ENDPOINT)
    url.searchParams.set('client', 'firefox')
    url.searchParams.set('q', query)
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1_800)
    })
    const payload = JSON.parse(await readBoundedResponse(response, 64 * 1024)) as unknown
    const candidates = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : []
    const suggestions = [...new Set(candidates.flatMap((value) => {
        const suggestion = normalizeSuggestion(value)
        return suggestion ? [suggestion] : []
    }))].slice(0, SEARCH_SUGGESTION_LIMIT)
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, suggestions })
    while (searchCache.size > SEARCH_CACHE_LIMIT) {
        const oldest = searchCache.keys().next().value
        if (oldest === undefined) break
        searchCache.delete(oldest)
    }
    return suggestions.slice()
}

