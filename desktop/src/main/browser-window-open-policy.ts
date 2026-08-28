export type BrowserWindowOpenDisposition = 'default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'other'

export type BrowserWindowOpenDetails = {
    url: string
    frameName?: string
    features?: string
    disposition: BrowserWindowOpenDisposition
    postBody?: unknown
}

export type BrowserWindowOpenIntent =
    | { kind: 'tab'; activate: boolean }
    | { kind: 'popup' }

const RESERVED_FRAME_NAMES = new Set(['', '_blank', '_self', '_parent', '_top'])
const POPUP_FEATURE_PATTERN = /(?:^|,)\s*(?:width|height|left|top|screenx|screeny)\s*=/i
const GMAIL_POPOUT_PATH_PATTERN = /^\/mail\/u\/[^/]+\/popout(?:\/|$)/i

function requiresOpenerContinuity(url: string): boolean {
    // Gmail popouts read window.opener and treat a null window.open() result as
    // a popup-blocker failure. Converting them into detached tabs breaks both.
    try {
        const target = new URL(url)
        return target.protocol === 'https:'
            && target.hostname.toLowerCase() === 'mail.google.com'
            && GMAIL_POPOUT_PATH_PATTERN.test(target.pathname)
    } catch {
        return false
    }
}

export function resolveBrowserWindowOpenIntent(details: BrowserWindowOpenDetails): BrowserWindowOpenIntent {
    const frameName = String(details.frameName || '').trim().toLowerCase()
    const features = String(details.features || '')
    const namedPopup = !RESERVED_FRAME_NAMES.has(frameName)
    const requestsPopupGeometry = POPUP_FEATURE_PATTERN.test(features)
    const needsRequestContinuity = Boolean(details.postBody)

    if (details.disposition === 'new-window' || namedPopup || requestsPopupGeometry || needsRequestContinuity || requiresOpenerContinuity(details.url)) {
        return { kind: 'popup' }
    }
    return {
        kind: 'tab',
        activate: details.disposition !== 'background-tab'
    }
}
