export type AssistantBrowserNavigationAttempt = {
    targetUrl: string
    targetStarted: boolean
    superseded: boolean
    stopped: boolean
}

export function createAssistantBrowserNavigationAttempt(targetUrl: string): AssistantBrowserNavigationAttempt {
    return { targetUrl, targetStarted: false, superseded: false, stopped: false }
}

export function observeAssistantBrowserNavigationStart(
    attempt: AssistantBrowserNavigationAttempt,
    eventUrl: string
): void {
    if (!eventUrl) return
    if (eventUrl === attempt.targetUrl) attempt.targetStarted = true
    else if (attempt.targetStarted) attempt.superseded = true
}

export function supersedeAssistantBrowserNavigation(attempt: AssistantBrowserNavigationAttempt | null): void {
    if (attempt) attempt.superseded = true
}

export function stopAssistantBrowserNavigation(attempt: AssistantBrowserNavigationAttempt | null): void {
    if (attempt) attempt.stopped = true
}

export function wasAssistantBrowserNavigationSupersededOrStopped(attempt: AssistantBrowserNavigationAttempt): boolean {
    return attempt.superseded || attempt.stopped
}

type BrowserNavigationError = {
    code?: unknown
    errno?: unknown
    errorCode?: unknown
    errorDescription?: unknown
    message?: unknown
}

function readBrowserNavigationErrorCode(error: unknown): string | null {
    if (!error) return null
    const candidate = typeof error === 'object' ? error as BrowserNavigationError : null
    if (typeof candidate?.code === 'string' && /^ERR_[A-Z0-9_]+$/iu.test(candidate.code)) {
        return candidate.code.toUpperCase()
    }
    const description = typeof error === 'string'
        ? error
        : [candidate?.message, candidate?.errorDescription]
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
    return description.match(/\bERR_[A-Z0-9_]+\b/iu)?.[0]?.toUpperCase() || null
}

export function isAssistantBrowserNavigationCancellation(error: unknown): boolean {
    if (!error || (typeof error !== 'object' && typeof error !== 'string')) return false
    const candidate = typeof error === 'object' ? error as BrowserNavigationError : null
    return candidate?.errno === -3
        || candidate?.errorCode === -3
        || readBrowserNavigationErrorCode(error) === 'ERR_ABORTED'
}

export function describeAssistantBrowserNavigationError(error: unknown): string {
    const code = readBrowserNavigationErrorCode(error)
    if (code === 'ERR_ABORTED') return 'Navigation was cancelled before the page loaded.'
    if (code === 'ERR_NAME_NOT_RESOLVED' || code === 'ERR_NAME_RESOLUTION_FAILED') {
        return 'This site’s address could not be found.'
    }
    if (code === 'ERR_INTERNET_DISCONNECTED') return 'You’re offline. Check your connection and try again.'
    if (code === 'ERR_CONNECTION_REFUSED') return 'The site refused the connection.'
    if (code === 'ERR_CONNECTION_TIMED_OUT' || code === 'ERR_TIMED_OUT') return 'The site took too long to respond.'
    if (code === 'ERR_TOO_MANY_REDIRECTS') return 'The site redirected too many times.'
    if (code === 'ERR_INVALID_URL') return 'That address is not valid.'
    if (code === 'ERR_BLOCKED_BY_CLIENT') return 'Browser protection blocked this page.'
    if (code === 'ERR_BLOCKED_BY_RESPONSE') return 'The site blocked this page from loading.'
    if (code?.startsWith('ERR_CERT_') || code === 'ERR_SSL_PROTOCOL_ERROR') {
        return 'Zyra could not verify this site’s security certificate.'
    }
    return 'The page could not be loaded.'
}

export async function loadAssistantBrowserWebviewUrl(
    loadUrl: (url: string) => Promise<void>,
    url: string,
    options: { wasSupersededOrStopped: () => boolean }
): Promise<void> {
    try {
        await loadUrl(url)
    } catch (error) {
        if (isAssistantBrowserNavigationCancellation(error) && options.wasSupersededOrStopped()) return
        throw new Error(describeAssistantBrowserNavigationError(error))
    }
}
