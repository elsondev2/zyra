import type { PreviewHtmlLocation } from './types'

export function withHtmlPreviewLocation(previewUrl: string, location?: PreviewHtmlLocation): string {
    if (!location) return previewUrl
    const url = new URL(previewUrl)
    const reserved = new Set(url.searchParams.keys())
    for (const [key, value] of new URLSearchParams(location.search)) {
        if (key !== 'devscope-preview' && !reserved.has(key)) url.searchParams.append(key, value)
    }
    url.hash = location.hash
    return url.href
}
