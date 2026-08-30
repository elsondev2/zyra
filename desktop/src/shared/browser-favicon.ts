export const BROWSER_PAGE_ICON_CHANNEL = 'devscope:browserPreview:getPageIcon'

export function resolveBrowserOriginFaviconUrl(pageUrl: unknown): string | null {
    try {
        const page = new URL(String(pageUrl || '').trim())
        if (page.protocol !== 'http:' && page.protocol !== 'https:') return null
        return new URL('/favicon.ico', page.origin).toString()
    } catch {
        return null
    }
}

export function isSameBrowserFaviconOrigin(candidateUrl: unknown, originUrl: string): boolean {
    try {
        const candidate = new URL(String(candidateUrl || ''), originUrl)
        const origin = new URL(originUrl)
        return (candidate.protocol === 'http:' || candidate.protocol === 'https:') && candidate.origin === origin.origin
    } catch {
        return false
    }
}
