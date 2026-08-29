import log from 'electron-log'
import { isSameBrowserFaviconOrigin, resolveBrowserOriginFaviconUrl } from '../shared/browser-favicon'

const FAVICON_MAX_BYTES = 256 * 1024
const FAVICON_CACHE_MAX_BYTES = 4 * 1024 * 1024
const FAVICON_CACHE_LIMIT = 128
const FAVICON_SUCCESS_TTL_MS = 24 * 60 * 60 * 1_000
const FAVICON_FAILURE_TTL_MS = 5 * 60 * 1_000
const FAVICON_FETCH_TIMEOUT_MS = 5_000
const FAVICON_REDIRECT_LIMIT = 3

const SUPPORTED_FAVICON_TYPES = new Set([
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/png',
    'image/gif',
    'image/jpeg',
    'image/webp'
])

type FaviconCacheEntry = {
    dataUrl: string | null
    bytes: number
    expiresAt: number
}

const faviconCache = new Map<string, FaviconCacheEntry>()
const pendingFavicons = new Map<string, Promise<string | null>>()
let faviconCacheBytes = 0

function cacheFavicon(key: string, dataUrl: string | null, bytes: number): void {
    const previous = faviconCache.get(key)
    if (previous) faviconCacheBytes -= previous.bytes
    faviconCache.delete(key)
    faviconCache.set(key, {
        dataUrl,
        bytes,
        expiresAt: Date.now() + (dataUrl ? FAVICON_SUCCESS_TTL_MS : FAVICON_FAILURE_TTL_MS)
    })
    faviconCacheBytes += bytes
    while (faviconCache.size > FAVICON_CACHE_LIMIT || faviconCacheBytes > FAVICON_CACHE_MAX_BYTES) {
        const oldestKey = faviconCache.keys().next().value as string | undefined
        if (!oldestKey) break
        const oldest = faviconCache.get(oldestKey)
        if (oldest) faviconCacheBytes -= oldest.bytes
        faviconCache.delete(oldestKey)
    }
}

async function fetchOriginFavicon(initialUrl: string): Promise<{ dataUrl: string; bytes: number } | null> {
    let currentUrl = initialUrl
    for (let redirectCount = 0; redirectCount <= FAVICON_REDIRECT_LIMIT; redirectCount += 1) {
        const response = await fetch(currentUrl, {
            redirect: 'manual',
            signal: AbortSignal.timeout(FAVICON_FETCH_TIMEOUT_MS),
            headers: {
                accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
                'user-agent': 'Mozilla/5.0 Zyra Browser'
            }
        })
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location')
            if (!location || redirectCount === FAVICON_REDIRECT_LIMIT) return null
            const redirectedUrl = new URL(location, currentUrl).toString()
            if (!isSameBrowserFaviconOrigin(redirectedUrl, initialUrl)) return null
            currentUrl = redirectedUrl
            continue
        }
        if (!response.ok) return null
        const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
        if (!SUPPORTED_FAVICON_TYPES.has(contentType)) return null
        const contentLength = Number(response.headers.get('content-length') || 0)
        if (contentLength > FAVICON_MAX_BYTES) return null
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength === 0 || bytes.byteLength > FAVICON_MAX_BYTES) return null
        return {
            dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
            bytes: bytes.byteLength
        }
    }
    return null
}

export async function getBrowserPageIcon(pageUrl: unknown): Promise<string | null> {
    const faviconUrl = resolveBrowserOriginFaviconUrl(pageUrl)
    if (!faviconUrl) return null
    const cached = faviconCache.get(faviconUrl)
    if (cached && cached.expiresAt > Date.now()) {
        faviconCache.delete(faviconUrl)
        faviconCache.set(faviconUrl, cached)
        return cached.dataUrl
    }
    if (cached) {
        faviconCacheBytes -= cached.bytes
        faviconCache.delete(faviconUrl)
    }
    const pending = pendingFavicons.get(faviconUrl)
    if (pending) return pending

    const request = fetchOriginFavicon(faviconUrl)
        .then((result) => {
            cacheFavicon(faviconUrl, result?.dataUrl || null, result?.bytes || 0)
            return result?.dataUrl || null
        })
        .catch((error) => {
            cacheFavicon(faviconUrl, null, 0)
            log.debug('[BrowserFavicon] Origin favicon fallback failed.', { faviconUrl, error })
            return null
        })
        .finally(() => pendingFavicons.delete(faviconUrl))
    pendingFavicons.set(faviconUrl, request)
    return request
}
