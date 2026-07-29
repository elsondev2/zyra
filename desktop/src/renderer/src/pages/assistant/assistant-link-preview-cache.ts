import type { DevScopeBrowserLinkPreview } from '@shared/contracts/devscope-api'

const LINK_PREVIEW_RENDERER_CACHE_LIMIT = 200
const LINK_PREVIEW_RENDERER_CACHE_TTL_MS = 15 * 60 * 1000
const LINK_PREVIEW_RENDERER_NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1000

type LinkPreviewCacheEntry = {
    expiresAt: number
    preview: DevScopeBrowserLinkPreview | null
}

const linkPreviewCache = new Map<string, LinkPreviewCacheEntry>()
const pendingLinkPreviews = new Map<string, Promise<DevScopeBrowserLinkPreview | null>>()

function normalizeLinkPreviewKey(rawUrl: string): string | null {
    try {
        const url = new URL(rawUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        url.hash = ''
        return url.toString()
    } catch {
        return null
    }
}

function retainLinkPreview(key: string, preview: DevScopeBrowserLinkPreview | null): void {
    linkPreviewCache.delete(key)
    linkPreviewCache.set(key, {
        expiresAt: Date.now() + (preview ? LINK_PREVIEW_RENDERER_CACHE_TTL_MS : LINK_PREVIEW_RENDERER_NEGATIVE_CACHE_TTL_MS),
        preview
    })
    while (linkPreviewCache.size > LINK_PREVIEW_RENDERER_CACHE_LIMIT) {
        const oldestKey = linkPreviewCache.keys().next().value
        if (oldestKey === undefined) break
        linkPreviewCache.delete(oldestKey)
    }
}

export async function getAssistantLinkPreview(rawUrl: string): Promise<DevScopeBrowserLinkPreview | null> {
    const key = normalizeLinkPreviewKey(rawUrl)
    if (!key) return null
    const cached = linkPreviewCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
        linkPreviewCache.delete(key)
        linkPreviewCache.set(key, cached)
        return cached.preview
    }
    if (cached) linkPreviewCache.delete(key)

    const existingRequest = pendingLinkPreviews.get(key)
    if (existingRequest) return existingRequest

    const getBrowserLinkPreview = window.devscope.getBrowserLinkPreview
    if (typeof getBrowserLinkPreview !== 'function') {
        retainLinkPreview(key, null)
        return null
    }

    const request = getBrowserLinkPreview({ url: key })
        .then((result) => result.success ? result.preview : null)
        .catch(() => null)
        .then((preview) => {
            retainLinkPreview(key, preview)
            return preview
        })
        .finally(() => {
            pendingLinkPreviews.delete(key)
        })
    pendingLinkPreviews.set(key, request)
    return request
}
