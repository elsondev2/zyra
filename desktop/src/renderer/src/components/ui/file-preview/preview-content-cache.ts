export type PreviewContentSnapshot = {
    content: string
    truncated: boolean
    size: number | null
    previewBytes: number | null
    modifiedAt: number | null
}

const MAX_PREVIEW_CACHE_ENTRIES = 8
const MAX_PREVIEW_CACHE_CONTENT_LENGTH = 2_000_000
const MAX_SINGLE_PREVIEW_CACHE_CONTENT_LENGTH = 600_000

function normalizeCacheKey(filePath: string): string {
    return String(filePath || '').trim().replace(/\\/g, '/').toLowerCase()
}

export function readPreviewContentCache(
    cache: Map<string, PreviewContentSnapshot>,
    filePath: string
): PreviewContentSnapshot | null {
    const key = normalizeCacheKey(filePath)
    const snapshot = cache.get(key) || null
    if (!snapshot) return null
    cache.delete(key)
    cache.set(key, snapshot)
    return snapshot
}

export function writePreviewContentCache(
    cache: Map<string, PreviewContentSnapshot>,
    filePath: string,
    snapshot: PreviewContentSnapshot
): void {
    const key = normalizeCacheKey(filePath)
    cache.delete(key)
    if (snapshot.content.length > MAX_SINGLE_PREVIEW_CACHE_CONTENT_LENGTH) return
    cache.set(key, snapshot)

    let retainedContentLength = [...cache.values()].reduce((total, entry) => total + entry.content.length, 0)
    while (cache.size > MAX_PREVIEW_CACHE_ENTRIES || retainedContentLength > MAX_PREVIEW_CACHE_CONTENT_LENGTH) {
        const oldest = cache.entries().next().value as [string, PreviewContentSnapshot] | undefined
        if (!oldest) break
        cache.delete(oldest[0])
        retainedContentLength -= oldest[1].content.length
    }
}
