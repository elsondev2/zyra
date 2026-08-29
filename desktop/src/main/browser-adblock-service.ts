import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ElectronBlocker, fromElectronDetails } from '@ghostery/adblocker-electron'
import * as electron from 'electron'
import type { Session } from 'electron'
import log from 'electron-log'
import type { DevScopeBrowserAdBlockStatus, DevScopeBrowserAdDetection } from '../shared/contracts/devscope-api'
import type { DevicePreferencesService } from './setup/device-preferences-service'
import {
    isBrowserAdBlockCompatibilityPageUrl,
    isSpotifyProtectedResourceUrl,
    isYouTubeBrowserPageUrl,
    isYouTubePlaybackTransportRequest,
    resolveBrowserAdBlockInitiatorUrls,
    resolveBrowserAdBlockSessionTransition,
    resolveBrowserAdDetectionOrigin,
    shouldBypassYouTubePlaybackRequest
} from './browser-adblock-policy'

const DETECTION_REPEAT_WINDOW_MS = 30 * 60 * 1_000
const FILTER_FETCH_TIMEOUT_MS = 15_000
const FILTER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const YOUTUBE_REQUEST_DECISION_TTL_MS = 2 * 60 * 1_000
const YOUTUBE_REQUEST_DECISION_LIMIT = 2_048
export const YOUTUBE_COSMETIC_FALLBACK_STYLES = `
yt-ad-slot-renderer,
ytd-ad-slot-renderer,
ytd-action-companion-ad-renderer,
ytd-companion-slot-renderer,
ytd-display-ad-renderer,
ytd-in-feed-ad-layout-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-promoted-video-renderer,
ytd-search-pyv-renderer,
ytm-promoted-sparkles-web-renderer,
#masthead-ad,
#player-ads,
ytd-rich-item-renderer:has(yt-ad-slot-renderer),
ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
ytd-video-renderer:has(yt-ad-slot-renderer),
ytd-video-renderer:has(ytd-ad-slot-renderer),
ytd-compact-video-renderer:has(yt-ad-slot-renderer),
ytd-compact-video-renderer:has(ytd-ad-slot-renderer) {
    display: none !important;
}`
const BUILT_IN_COMPATIBILITY_FILTERS = [
    '@@||open.spotify.com^$document',
    '@@*$domain=open.spotify.com',
    '@@||accounts.spotify.com^$document',
    '@@*$domain=accounts.spotify.com',
    '@@||chatgpt.com^$document',
    '@@*$domain=chatgpt.com',
    '@@||openai.com^$document',
    '@@*$domain=openai.com',
    '@@||tiktok.com^$document',
    '@@*$domain=tiktok.com',
    '@@||localhost^$document',
    '@@||127.0.0.1^$document',
    '@@||0.0.0.0^$document',
    '@@*$domain=localhost|127.0.0.1|0.0.0.0'
]

function writeBinaryAtomically(path: string, value: Uint8Array): Promise<void> {
    return (async () => {
        await mkdir(dirname(path), { recursive: true })
        const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
        await writeFile(temporaryPath, value, { mode: 0o600 })
        await rename(temporaryPath, path)
    })()
}

type BrowserAdBlockRequestDetails = Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails

type YouTubeCosmeticInjectionEvent = Parameters<ElectronBlocker['onInjectCosmeticFilters']>[0]
type YouTubeCosmeticInjectionMessage = Parameters<ElectronBlocker['onInjectCosmeticFilters']>[2]

function requestInitiatorUrls(details: BrowserAdBlockRequestDetails): string[] {
    let frameAvailable = false
    let frameUrl: string | null = null
    try {
        if (details.frame && !details.frame.isDestroyed()) {
            frameAvailable = true
            frameUrl = details.frame.url
        }
    } catch {
        // Fall through only when Chromium no longer exposes the requesting frame.
    }
    let topLevelUrl: string | null = null
    try {
        if (details.webContents && !details.webContents.isDestroyed()) topLevelUrl = details.webContents.getURL()
    } catch {
        // No trustworthy top-level fallback survived.
    }
    return resolveBrowserAdBlockInitiatorUrls({
        frameAvailable,
        frameUrl,
        referrer: details.referrer,
        topLevelUrl
    })
}

function requestPageUrl(details: BrowserAdBlockRequestDetails): string {
    return requestInitiatorUrls(details)[0] || ''
}

function youtubeRegistrableDomain(url: string): string | null {
    try {
        const hostname = new URL(url).hostname.toLowerCase()
        if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) return 'youtube.com'
        if (hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com')) return 'youtube-nocookie.com'
        if (hostname === 'youtubekids.com' || hostname.endsWith('.youtubekids.com')) return 'youtubekids.com'
        return null
    } catch {
        return null
    }
}

function youtubeFrameMatchesOrigin(frame: Electron.WebFrameMain, expectedOrigin: string): boolean {
    try {
        return !frame.isDestroyed()
            && isYouTubeBrowserPageUrl(frame.url)
            && new URL(frame.url).origin === expectedOrigin
    } catch {
        return false
    }
}

function isolateYouTubeScriptlet(script: string, expectedOrigin: string): string {
    return `(() => {\nif (location.origin !== ${JSON.stringify(expectedOrigin)}) return;\n${script}\n})()`
}

export function createYouTubeStyleInjection(styles: string, expectedOrigin: string): string {
    const styleKey = createHash('sha256').update(styles).digest('hex').slice(0, 24)
    return `(() => {
        const expectedOrigin = ${JSON.stringify(expectedOrigin)};
        const marker = 'data-zyra-youtube-cosmetics';
        const styleKey = ${JSON.stringify(styleKey)};
        const apply = () => {
            if (location.origin !== expectedOrigin) return true;
            const parent = document.head || document.documentElement;
            if (!parent) return false;
            if (document.querySelector('style[' + marker + '="' + styleKey + '"]')) return true;
            const style = document.createElement('style');
            style.setAttribute(marker, styleKey);
            style.textContent = ${JSON.stringify(styles)};
            parent.appendChild(style);
            return true;
        };
        if (!apply()) addEventListener('DOMContentLoaded', apply, { once: true, passive: true });
    })()`
}

export async function injectYouTubeCosmeticsInRequestingFrame(
    blocker: ElectronBlocker,
    event: YouTubeCosmeticInjectionEvent,
    url: string,
    message: YouTubeCosmeticInjectionMessage
): Promise<void> {
    const domain = youtubeRegistrableDomain(url)
    const frame = event.senderFrame
    if (!domain || !frame || frame.isDestroyed() || !isYouTubeBrowserPageUrl(frame.url)) return
    const expectedOrigin = new URL(frame.url).origin
    const requestUrl = new URL(url)
    if (requestUrl.origin !== expectedOrigin) return
    const hostname = requestUrl.hostname.toLowerCase()
    const firstRun = message === undefined
    const { active, styles, scripts } = blocker.getCosmeticsFilters({
        domain,
        hostname,
        url,
        classes: message?.classes,
        hrefs: message?.hrefs,
        ids: message?.ids,
        getBaseRules: firstRun,
        getInjectionRules: firstRun,
        getExtendedRules: false,
        getRulesFromHostname: firstRun,
        getRulesFromDOM: !firstRun,
        callerContext: {
            frameId: event.frameId,
            processId: event.processId,
            lifecycle: message?.lifecycle
        }
    })
    if (active === false) return
    const frameStyles = firstRun
        ? `${YOUTUBE_COSMETIC_FALLBACK_STYLES}\n${styles}`
        : styles
    if (frameStyles.length > 0 && youtubeFrameMatchesOrigin(frame, expectedOrigin)) {
        try {
            await frame.executeJavaScript(createYouTubeStyleInjection(frameStyles, expectedOrigin), false)
        } catch (error) {
            log.debug('[BrowserAdBlock] YouTube cosmetic styles skipped', {
                errorType: error instanceof Error ? error.name : 'UnknownError'
            })
        }
    }
    for (const script of new Set(scripts)) {
        if (!youtubeFrameMatchesOrigin(frame, expectedOrigin)) return
        try {
            await frame.executeJavaScript(isolateYouTubeScriptlet(script, expectedOrigin), true)
        } catch (error) {
            log.debug('[BrowserAdBlock] YouTube scriptlet injection skipped', {
                errorType: error instanceof Error ? error.name : 'UnknownError'
            })
        }
    }
}

export class ZyraElectronBlocker extends ElectronBlocker {
    private readonly youtubePlaybackDecisions = new Map<number, { allowed: boolean; createdAt: number }>()

    private rememberYouTubePlaybackDecision(requestId: number, allowed: boolean): void {
        const now = Date.now()
        this.youtubePlaybackDecisions.set(requestId, { allowed, createdAt: now })
        for (const [id, decision] of this.youtubePlaybackDecisions) {
            if (now - decision.createdAt <= YOUTUBE_REQUEST_DECISION_TTL_MS) continue
            this.youtubePlaybackDecisions.delete(id)
        }
        while (this.youtubePlaybackDecisions.size > YOUTUBE_REQUEST_DECISION_LIMIT) {
            const oldestId = this.youtubePlaybackDecisions.keys().next().value
            if (oldestId === undefined) break
            this.youtubePlaybackDecisions.delete(oldestId)
        }
    }

    private readYouTubePlaybackDecision(requestId: number): boolean | null {
        const decision = this.youtubePlaybackDecisions.get(requestId)
        if (!decision) return null
        if (Date.now() - decision.createdAt > YOUTUBE_REQUEST_DECISION_TTL_MS) {
            this.youtubePlaybackDecisions.delete(requestId)
            return null
        }
        return decision.allowed
    }

    private resolveYouTubePlaybackBypass(details: BrowserAdBlockRequestDetails, remember: boolean): boolean {
        if (!isYouTubePlaybackTransportRequest({ requestUrl: details.url, resourceType: details.resourceType })) return false
        if (!remember) {
            const recorded = this.readYouTubePlaybackDecision(details.id)
            if (recorded !== null) return recorded
        }
        const allowed = shouldBypassYouTubePlaybackRequest({
            initiatorUrls: requestInitiatorUrls(details),
            requestUrl: details.url,
            resourceType: details.resourceType
        })
        this.rememberYouTubePlaybackDecision(details.id, allowed)
        return allowed
    }

    constructor(...args: ConstructorParameters<typeof ElectronBlocker>) {
        super(...args)
        const blockRequest = this.onBeforeRequest
        const filterHeaders = this.onHeadersReceived
        const injectCosmetics = this.onInjectCosmeticFilters
        this.onBeforeRequest = (details, callback) => {
            if (
                isBrowserAdBlockCompatibilityPageUrl(requestPageUrl(details))
                || isSpotifyProtectedResourceUrl(details.url)
                || this.resolveYouTubePlaybackBypass(details, true)
            ) {
                callback({})
                return
            }
            blockRequest(details, callback)
        }
        this.onHeadersReceived = (details, callback) => {
            if (
                isBrowserAdBlockCompatibilityPageUrl(requestPageUrl(details))
                || isSpotifyProtectedResourceUrl(details.url)
                || this.resolveYouTubePlaybackBypass(details, false)
            ) {
                callback({})
                return
            }
            filterHeaders(details, callback)
        }
        this.onInjectCosmeticFilters = async (event, url, message) => {
            if (isBrowserAdBlockCompatibilityPageUrl(url)) return
            if (isYouTubeBrowserPageUrl(url)) {
                await injectYouTubeCosmeticsInRequestingFrame(this, event, url, message)
                return
            }
            await injectCosmetics(event, url, message)
        }
    }
}

function reloadCurrentYouTubeDocuments(browserSession: Session): void {
    for (const contents of electron.webContents.getAllWebContents()) {
        try {
            if (contents.isDestroyed() || contents.session !== browserSession || !isYouTubeBrowserPageUrl(contents.getURL())) continue
            contents.reload()
        } catch {
            // A tab can disappear between enumeration and reload.
        }
    }
}

function fetchFilters(url: string) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FILTER_FETCH_TIMEOUT_MS)
    timer.unref?.()
    return fetch(url, { signal: controller.signal })
        .then((response) => {
            if (!response.ok) throw new Error(`Filter request failed with HTTP ${response.status}.`)
            return response
        })
        .finally(() => clearTimeout(timer))
}

export class BrowserAdBlockService {
    private browserSession: Session | null = null
    private readonly networkOnlySessions = new Set<Session>()
    private blocker: ElectronBlocker | null = null
    private blockerPromise: Promise<ElectronBlocker> | null = null
    private enabled = false
    private promptDismissed = false
    private error: string | null = null
    private operationQueue: Promise<void> = Promise.resolve()
    private readonly recentlyDetectedOrigins = new Map<string, number>()

    constructor(
        private readonly preferences: DevicePreferencesService,
        private readonly cachePath: string,
        private readonly notify: (event: DevScopeBrowserAdDetection) => void
    ) {
        this.preferences.subscribe((event) => {
            if (!event.changedKeys.some((key) => key === 'assistantBrowserAdBlockEnabled' || key === 'assistantBrowserAdBlockPromptDismissed')) return
            void this.refreshPreferences()
        })
        void this.refreshPreferences()
    }

    attachSession(browserSession: Session): void {
        if (this.browserSession === browserSession) return
        this.browserSession = browserSession
        void this.synchronizeSession().catch(() => undefined)
    }

    attachNetworkOnlySession(browserSession: Session): void {
        if (this.networkOnlySessions.has(browserSession)) return
        this.networkOnlySessions.add(browserSession)
        void this.synchronizeNetworkOnlySession(browserSession).catch(() => undefined)
    }

    detachNetworkOnlySession(browserSession: Session): void {
        if (!this.networkOnlySessions.delete(browserSession)) return
        browserSession.webRequest.onHeadersReceived(null)
        browserSession.webRequest.onBeforeRequest(null)
    }

    status(): DevScopeBrowserAdBlockStatus {
        return {
            enabled: this.enabled,
            ready: Boolean(this.blocker),
            engine: 'Ghostery',
            error: this.error
        }
    }

    setEnabled(enabled: boolean, promptDismissed?: boolean): Promise<DevScopeBrowserAdBlockStatus> {
        return this.enqueueOperation(async () => {
            const previousEnabled = this.enabled
            const previousPromptDismissed = this.promptDismissed
            const desiredPromptDismissed = promptDismissed ?? this.promptDismissed
            this.enabled = enabled
            this.promptDismissed = desiredPromptDismissed
            try {
                await this.applySessionState()
                await this.preferences.updateSurfaceFromMain('desktop', {
                    assistantBrowserAdBlockEnabled: enabled,
                    assistantBrowserAdBlockPromptDismissed: desiredPromptDismissed
                })
                return this.status()
            } catch (error) {
                const transitionError = this.error
                this.enabled = previousEnabled
                this.promptDismissed = previousPromptDismissed
                try {
                    await this.applySessionState()
                } catch {
                    // Preserve the rollback failure in this.error for status reporting.
                }
                if (transitionError) throw new Error(transitionError)
                throw error
            }
        })
    }

    private refreshPreferences(): Promise<void> {
        return this.enqueueOperation(async () => {
            const snapshot = await this.preferences.get({ surface: 'desktop' })
            this.enabled = snapshot.settings.assistantBrowserAdBlockEnabled === true
            this.promptDismissed = snapshot.settings.assistantBrowserAdBlockPromptDismissed === true
            await this.applySessionState()
        }).catch((error) => {
            log.debug('[BrowserAdBlock] Preferences unavailable', { errorType: error instanceof Error ? error.name : 'UnknownError' })
        })
    }

    private synchronizeSession(): Promise<void> {
        return this.enqueueOperation(() => this.applySessionState())
    }

    private synchronizeNetworkOnlySession(browserSession: Session): Promise<void> {
        return this.enqueueOperation(async () => {
            if (!this.networkOnlySessions.has(browserSession)) return
            const blocker = await this.requireBlocker()
            this.applyNetworkOnlySessionState(browserSession, blocker)
        })
    }

    private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationQueue.then(operation, operation)
        this.operationQueue = result.then(() => undefined, () => undefined)
        return result
    }

    private async applySessionState(): Promise<void> {
        const browserSession = this.browserSession
        if (!browserSession && this.networkOnlySessions.size === 0) return
        let blocker: ElectronBlocker
        try {
            blocker = await this.requireBlocker()
        } catch (error) {
            this.error = 'Built-in ad blocking is unavailable while its filter list cannot be loaded.'
            log.warn('[BrowserAdBlock] Filter engine unavailable', { errorType: error instanceof Error ? error.name : 'UnknownError' })
            throw error
        }
        try {
            if (browserSession) {
                const transition = resolveBrowserAdBlockSessionTransition(this.enabled, blocker.isBlockingEnabled(browserSession))
                if (transition === 'enable-blocking') {
                    browserSession.webRequest.onBeforeRequest(null)
                    blocker.enableBlockingInSession(browserSession)
                    reloadCurrentYouTubeDocuments(browserSession)
                } else if (transition === 'disable-to-passive') {
                    blocker.disableBlockingInSession(browserSession)
                    this.installPassiveDetector(browserSession, blocker)
                    reloadCurrentYouTubeDocuments(browserSession)
                } else if (transition === 'keep-passive') {
                    browserSession.webRequest.onBeforeRequest(null)
                    this.installPassiveDetector(browserSession, blocker)
                }
            }
            for (const temporarySession of this.networkOnlySessions) {
                this.applyNetworkOnlySessionState(temporarySession, blocker)
            }
            this.error = null
        } catch (error) {
            this.error = 'Built-in ad blocking could not be configured.'
            log.warn('[BrowserAdBlock] Session configuration failed', { errorType: error instanceof Error ? error.name : 'UnknownError' })
            throw error
        }
    }

    private applyNetworkOnlySessionState(browserSession: Session, blocker: ElectronBlocker): void {
        browserSession.webRequest.onHeadersReceived(null)
        browserSession.webRequest.onBeforeRequest(null)
        if (this.enabled) {
            // Ghostery's cosmetic-filter IPC handlers are process-global, so its
            // full helper cannot be enabled in a second Electron Session. Private
            // sessions still receive the same network and response-header filters.
            browserSession.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, blocker.onHeadersReceived)
            browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, blocker.onBeforeRequest)
            return
        }
        this.installPassiveDetector(browserSession, blocker)
    }

    private requireBlocker(): Promise<ElectronBlocker> {
        if (this.blocker) return Promise.resolve(this.blocker)
        if (!this.blockerPromise) {
            this.blockerPromise = (async () => {
                await mkdir(dirname(this.cachePath), { recursive: true })
                let cached: Uint8Array | null = null
                let cacheFresh = false
                try {
                    const [bytes, details] = await Promise.all([readFile(this.cachePath), stat(this.cachePath)])
                    cached = new Uint8Array(bytes)
                    cacheFresh = Date.now() - details.mtimeMs <= FILTER_CACHE_TTL_MS
                } catch {
                    // The first Browser use has no cached engine yet.
                }
                let blocker: ZyraElectronBlocker | null = null
                if (cached && cacheFresh) {
                    try {
                        blocker = ZyraElectronBlocker.deserialize(cached)
                    } catch {
                        cached = null
                    }
                }
                if (!blocker) {
                    try {
                        blocker = await ZyraElectronBlocker.fromPrebuiltFull(fetchFilters)
                        await writeBinaryAtomically(this.cachePath, blocker.serialize())
                    } catch (error) {
                        if (!cached) throw error
                        blocker = ZyraElectronBlocker.deserialize(cached)
                    }
                }
                blocker.updateFromDiff({ added: BUILT_IN_COMPATIBILITY_FILTERS, removed: [] })
                this.blocker = blocker
                return blocker
            })().finally(() => {
                this.blockerPromise = null
            })
        }
        return this.blockerPromise
    }

    private installPassiveDetector(browserSession: Session, blocker: ElectronBlocker): void {
        browserSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
            try {
                if (!this.enabled && !this.promptDismissed) {
                    const result = blocker.match(fromElectronDetails(details))
                    const pageUrl = details.webContents && !details.webContents.isDestroyed()
                        ? details.webContents.getURL()
                        : details.referrer
                    const pageOrigin = resolveBrowserAdDetectionOrigin({
                        requestUrl: details.url,
                        pageUrl,
                        resourceType: details.resourceType,
                        matched: result.match,
                        excepted: Boolean(result.exception)
                    })
                    if (pageOrigin && this.shouldNotify(pageOrigin)) {
                        this.notify({
                            pageOrigin,
                            guestWebContentsId: Number.isInteger(details.webContentsId) ? details.webContentsId! : null,
                            detectedAt: new Date().toISOString()
                        })
                    }
                }
            } catch {
                // Passive detection must never interfere with a page request.
            }
            callback({})
        })
    }

    private shouldNotify(pageOrigin: string): boolean {
        const now = Date.now()
        const lastDetectedAt = this.recentlyDetectedOrigins.get(pageOrigin) || 0
        if (now - lastDetectedAt < DETECTION_REPEAT_WINDOW_MS) return false
        this.recentlyDetectedOrigins.set(pageOrigin, now)
        while (this.recentlyDetectedOrigins.size > 100) {
            const oldest = this.recentlyDetectedOrigins.keys().next().value
            if (!oldest) break
            this.recentlyDetectedOrigins.delete(oldest)
        }
        return true
    }
}

let configuredService: BrowserAdBlockService | null = null

export function configureBrowserAdBlockService(input: {
    preferences: DevicePreferencesService
    userDataPath: string
    notify: (event: DevScopeBrowserAdDetection) => void
}): BrowserAdBlockService {
    if (!configuredService) {
        configuredService = new BrowserAdBlockService(
            input.preferences,
            join(input.userDataPath, 'browser-preview', 'adblock-engine-v2.bin'),
            input.notify
        )
    }
    return configuredService
}

export function getBrowserAdBlockService(): BrowserAdBlockService | null {
    return configuredService
}
