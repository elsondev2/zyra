/** Only official HTTPS listing routes may offer installation. Search/category pages cannot. */
export function chromeWebStoreIdFromUrl(value: string): string | null {
    try {
        const url = new URL(value)
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
        const prefix = url.hostname === 'chromewebstore.google.com' ? '/detail/'
            : url.hostname === 'chrome.google.com' ? '/webstore/detail/' : null
        if (!prefix || !url.pathname.startsWith(prefix)) return null
        const match = url.pathname.slice(prefix.length).match(/^(?:[^/]+\/)?([a-p]{32})\/?$/)
        return match?.[1] || null
    } catch { return null }
}

export type WebStoreInstallState = 'ready' | 'downloading' | 'reviewing' | 'installed' | 'error'
export type WebStoreInstallPresentation = { id: string; requestUrl: string; state: WebStoreInstallState }
export type WebStoreInstallTheme = { accent: string; background: string; foreground: string; fontFamily: string; colorScheme: string }
