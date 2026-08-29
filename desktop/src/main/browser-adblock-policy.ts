export type BrowserAdBlockSessionTransition = 'keep-blocking' | 'enable-blocking' | 'disable-to-passive' | 'keep-passive'

export function resolveBrowserAdBlockSessionTransition(desiredEnabled: boolean, currentlyEnabled: boolean): BrowserAdBlockSessionTransition {
    if (desiredEnabled) return currentlyEnabled ? 'keep-blocking' : 'enable-blocking'
    return currentlyEnabled ? 'disable-to-passive' : 'keep-passive'
}

export type BrowserAdDetectionCandidate = {
    requestUrl: string
    pageUrl: string
    resourceType: string
    matched: boolean
    excepted?: boolean
}

const DETECTABLE_RESOURCE_TYPES = new Set([
    'subFrame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xhr',
    'media',
    'webSocket',
    'other'
])

function parseWebOrigin(value: string): string | null {
    try {
        const url = new URL(value)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        return url.origin
    } catch {
        return null
    }
}

function isLocalOrigin(origin: string): boolean {
    try {
        const hostname = new URL(origin).hostname.toLowerCase()
        return hostname === 'localhost'
            || hostname === '0.0.0.0'
            || hostname === '::1'
            || hostname === '[::1]'
            || hostname.endsWith('.localhost')
            || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    } catch {
        return true
    }
}

export function isBrowserAdBlockCompatibilityPageUrl(value: string): boolean {
    const origin = parseWebOrigin(value)
    if (!origin) return false
    if (isLocalOrigin(origin)) return true
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname === 'open.spotify.com'
        || hostname === 'accounts.spotify.com'
        || hostname === 'chatgpt.com'
        || hostname.endsWith('.chatgpt.com')
        || hostname === 'openai.com'
        || hostname.endsWith('.openai.com')
        || hostname === 'tiktok.com'
        || hostname.endsWith('.tiktok.com')
}

export function isSpotifyProtectedResourceUrl(value: string): boolean {
    const origin = parseWebOrigin(value)
    if (!origin) return false
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname === 'spotify.com'
        || hostname.endsWith('.spotify.com')
        || hostname === 'spotifycdn.com'
        || hostname.endsWith('.spotifycdn.com')
        || hostname === 'scdn.co'
        || hostname.endsWith('.scdn.co')
}

function isHostnameOrSubdomain(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function isYouTubeBrowserPageUrl(value: string): boolean {
    try {
        const url = new URL(value)
        if (url.protocol !== 'https:') return false
        const hostname = url.hostname.toLowerCase()
        return isHostnameOrSubdomain(hostname, 'youtube.com')
            || isHostnameOrSubdomain(hostname, 'youtube-nocookie.com')
            || isHostnameOrSubdomain(hostname, 'youtubekids.com')
    } catch {
        return false
    }
}

export function resolveBrowserAdBlockInitiatorUrls(input: {
    frameAvailable: boolean
    frameUrl?: string | null
    referrer?: string | null
    topLevelUrl?: string | null
}): string[] {
    if (input.frameAvailable) return input.frameUrl ? [input.frameUrl] : []
    if (input.referrer) return [input.referrer]
    return input.topLevelUrl ? [input.topLevelUrl] : []
}

export function isYouTubePlaybackTransportRequest(input: {
    requestUrl: string
    resourceType: string
}): boolean {
    if (input.resourceType !== 'media' && input.resourceType !== 'xhr' && input.resourceType !== 'other') return false
    try {
        const requestUrl = new URL(input.requestUrl)
        const playbackPath = requestUrl.pathname === '/videoplayback' || requestUrl.pathname.startsWith('/videoplayback/')
        return requestUrl.protocol === 'https:'
            && playbackPath
            && isHostnameOrSubdomain(requestUrl.hostname.toLowerCase(), 'googlevideo.com')
    } catch {
        return false
    }
}

export function shouldBypassYouTubePlaybackRequest(input: {
    initiatorUrls: readonly string[]
    requestUrl: string
    resourceType: string
}): boolean {
    return input.initiatorUrls.some(isYouTubeBrowserPageUrl)
        && isYouTubePlaybackTransportRequest(input)
}

export function resolveBrowserAdDetectionOrigin(candidate: BrowserAdDetectionCandidate): string | null {
    if (!candidate.matched || candidate.excepted) return null
    if (!DETECTABLE_RESOURCE_TYPES.has(candidate.resourceType)) return null
    const requestOrigin = parseWebOrigin(candidate.requestUrl)
    const pageOrigin = parseWebOrigin(candidate.pageUrl)
    if (!requestOrigin || !pageOrigin || isLocalOrigin(requestOrigin) || isBrowserAdBlockCompatibilityPageUrl(candidate.pageUrl)) return null
    return pageOrigin
}
