import { createHash, randomUUID } from 'crypto'
import { app, session, shell, type IpcMainInvokeEvent, type Session } from 'electron'
import log from 'electron-log'
import type { DevScopeBrowserBackgroundCategory, DevScopeBrowserHistoryRecordInput, DevScopeBrowserLinkPreview, DevScopeBrowserThreatCheckInput } from '../../../shared/contracts/devscope-api'
import type { ExternalBrowserHistoryImportInput } from '../../../shared/external-browser-history-contracts'
import { fetchBrowserLinkPreview } from './browser-link-preview'
import { BrowserHistoryStore, getBrowserHistoryFilePath } from '../../browser-history-store'
import { fetchGoogleBrowserSearchSuggestions } from '../../browser-new-tab-service'
import { getBrowserAdBlockService } from '../../browser-adblock-service'
import { getBrowserBackgroundService } from '../../browser-background-service'
import { getProtectedMediaStatus, initializeProtectedMedia } from '../../protected-media-service'
import { ExternalBrowserHistoryService } from '../../external-browser-history/service'
import { getBrowserDownloadService } from '../../browser-download-service'
import { getBrowserPageIcon } from '../../browser-favicon-service'
import type { BrowserDownloadAction, BrowserDownloadsFolderAction } from '../../../shared/browser-downloads'
import { isTrustedBrowserTabId, trustedBrowserGuests } from '../../agent-control/trusted-guest-registry'
import { getBrowserThreatProtectionService } from '../../browser-threat-protection-service'

export const ZYRA_BROWSER_PARTITION_PREFIX = 'persist:zyra-browser-'
export const ZYRA_BROWSER_WEB_PREFERENCES = 'contextIsolation=true,sandbox=true,nodeIntegration=false'
const ZYRA_BROWSER_GLOBAL_PROFILE_KEY = 'zyra-global-browser-profile:v1'
const configuredPartitions = new Set<string>()
const activeIncognitoSessions = new Set<Session>()
const incognitoPartitionBySession = new WeakMap<Session, string>()
const authorizedBrowserPermissionTargets = new Set<number>()
const AUTOMATIC_BROWSER_PERMISSIONS = new Set(['fullscreen', 'mediaKeySystem', 'clipboard-sanitized-write'])
const LINK_PREVIEW_CACHE_LIMIT = 100
const LINK_PREVIEW_PENDING_LIMIT = 100
const LINK_PREVIEW_CONCURRENCY_LIMIT = 4
const LINK_PREVIEW_CACHE_TTL_MS = 15 * 60 * 1000
const LINK_PREVIEW_NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1000
const linkPreviewCache = new Map<string, { expiresAt: number; preview: DevScopeBrowserLinkPreview | null }>()
const pendingLinkPreviews = new Map<string, Promise<DevScopeBrowserLinkPreview | null>>()
const queuedLinkPreviewTasks: Array<() => void> = []
let activeLinkPreviewTasks = 0
let browserHistoryStore: BrowserHistoryStore | null = null
let externalBrowserHistoryService: ExternalBrowserHistoryService | null = null
let browserProfileFlushTimer: ReturnType<typeof setTimeout> | null = null
let browserProfileFlushPromise: Promise<void> | null = null
let browserProfileInitialized = false

function getBrowserHistoryStore(): BrowserHistoryStore {
    if (!browserHistoryStore) browserHistoryStore = new BrowserHistoryStore(getBrowserHistoryFilePath(app.getPath('userData')))
    return browserHistoryStore
}

export function recordGlobalBrowserHistory(input: DevScopeBrowserHistoryRecordInput) {
    return getBrowserHistoryStore().record(input)
}

function getExternalBrowserHistoryService(): ExternalBrowserHistoryService {
    if (!externalBrowserHistoryService) externalBrowserHistoryService = new ExternalBrowserHistoryService(getBrowserHistoryStore())
    return externalBrowserHistoryService
}

function drainLinkPreviewQueue(): void {
    while (activeLinkPreviewTasks < LINK_PREVIEW_CONCURRENCY_LIMIT && queuedLinkPreviewTasks.length > 0) {
        const run = queuedLinkPreviewTasks.shift()
        if (!run) break
        activeLinkPreviewTasks += 1
        run()
    }
}

function scheduleLinkPreview(task: () => Promise<DevScopeBrowserLinkPreview>): Promise<DevScopeBrowserLinkPreview | null> {
    return new Promise((resolve) => {
        queuedLinkPreviewTasks.push(() => {
            void task().then(resolve, (error: unknown) => {
                log.debug('[BrowserPreview] Link metadata unavailable:', error)
                resolve(null)
            }).finally(() => {
                activeLinkPreviewTasks = Math.max(0, activeLinkPreviewTasks - 1)
                drainLinkPreviewQueue()
            })
        })
        drainLinkPreviewQueue()
    })
}

export function isZyraBrowserPartition(partition: string): boolean {
    return partition === ZYRA_BROWSER_GLOBAL_PARTITION
}

export function registerBrowserPermissionTarget(webContents: Electron.WebContents, ownerWebContents: Electron.WebContents | null = webContents.hostWebContents): void {
    authorizedBrowserPermissionTargets.add(webContents.id)
    getBrowserDownloadService().registerTarget(webContents, ownerWebContents)
    webContents.once('destroyed', () => authorizedBrowserPermissionTargets.delete(webContents.id))
}

function isAuthorizedBrowserPermissionTarget(webContents: Electron.WebContents | null): webContents is Electron.WebContents {
    return Boolean(webContents && !webContents.isDestroyed() && authorizedBrowserPermissionTargets.has(webContents.id))
}

function isSecureBrowserPermissionUrl(value: string, httpsRequired: boolean): boolean {
    try {
        const parsed = new URL(value)
        return httpsRequired ? parsed.protocol === 'https:' : parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

function isSecureBrowserClipboardUrl(value: string): boolean {
    try {
        const parsed = new URL(value)
        if (parsed.protocol === 'https:') return true
        if (parsed.protocol !== 'http:') return false
        const hostname = parsed.hostname.toLowerCase()
        return hostname === 'localhost'
            || hostname.endsWith('.localhost')
            || hostname === '[::1]'
            || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    } catch {
        return false
    }
}

export function isSafeBrowserNavigationUrl(value: string): boolean {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

function deriveBrowserPartition(profileKey: string): string {
    const digest = createHash('sha256').update(profileKey).digest('hex').slice(0, 20)
    return `${ZYRA_BROWSER_PARTITION_PREFIX}${digest}`
}

export const ZYRA_BROWSER_GLOBAL_PARTITION = deriveBrowserPartition(ZYRA_BROWSER_GLOBAL_PROFILE_KEY)

export function getGlobalBrowserSession(): Session {
    browserProfileInitialized = true
    const browserSession = session.fromPartition(ZYRA_BROWSER_GLOBAL_PARTITION, { cache: true })
    configureBrowserSession(browserSession, ZYRA_BROWSER_GLOBAL_PARTITION)
    getBrowserAdBlockService()?.attachSession(browserSession)
    return browserSession
}

export function createIncognitoBrowserSession(): Session {
    const partition = `zyra-browser-incognito-${randomUUID()}`
    const browserSession = session.fromPartition(partition, { cache: false })
    if (browserSession.isPersistent()) throw new Error('Incognito Browser storage must not use a persistent partition.')
    configureBrowserSession(browserSession, partition)
    getBrowserAdBlockService()?.attachNetworkOnlySession(browserSession)
    activeIncognitoSessions.add(browserSession)
    incognitoPartitionBySession.set(browserSession, partition)
    return browserSession
}

export async function disposeIncognitoBrowserSession(browserSession: Session): Promise<void> {
    if (!activeIncognitoSessions.delete(browserSession)) return
    getBrowserAdBlockService()?.detachNetworkOnlySession(browserSession)
    const partition = incognitoPartitionBySession.get(browserSession)
    if (partition) configuredPartitions.delete(partition)
    await Promise.allSettled([
        browserSession.clearStorageData(),
        browserSession.clearCache(),
        browserSession.clearAuthCache()
    ])
}

export function transferBrowserPermissionTargetOwner(webContents: Electron.WebContents, ownerWebContents: Electron.WebContents): void {
    if (!isAuthorizedBrowserPermissionTarget(webContents) || ownerWebContents.isDestroyed()) return
    getBrowserDownloadService().transferTargetOwner(webContents, ownerWebContents)
}

export async function flushGlobalBrowserProfileStorage(): Promise<void> {
    if (!browserProfileInitialized) return
    if (browserProfileFlushTimer) {
        clearTimeout(browserProfileFlushTimer)
        browserProfileFlushTimer = null
    }
    if (browserProfileFlushPromise) return browserProfileFlushPromise
    const browserSession = getGlobalBrowserSession()
    browserProfileFlushPromise = (async () => {
        browserSession.flushStorageData()
        await browserSession.cookies.flushStore()
    })().finally(() => {
        browserProfileFlushPromise = null
    })
    return browserProfileFlushPromise
}

export function scheduleGlobalBrowserProfileFlush(delayMs = 1_500): void {
    if (browserProfileFlushTimer) clearTimeout(browserProfileFlushTimer)
    browserProfileFlushTimer = setTimeout(() => {
        browserProfileFlushTimer = null
        void flushGlobalBrowserProfileStorage().catch((error) => {
            log.warn('[BrowserPreview] Could not flush persistent profile storage', error)
        })
    }, Math.max(100, delayMs))
}

function configureBrowserSession(browserSession: Session, partition: string): void {
    if (configuredPartitions.has(partition)) return
    configuredPartitions.add(partition)

    const userAgent = browserSession.getUserAgent().replace(/Electron\/[\d.]+\s*/g, '')
    browserSession.setUserAgent(userAgent)
    browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (!isAuthorizedBrowserPermissionTarget(webContents) || !AUTOMATIC_BROWSER_PERMISSIONS.has(permission)) return false
        const requestingUrl = details.requestingUrl || requestingOrigin
        if (permission === 'mediaKeySystem') return isSecureBrowserPermissionUrl(requestingUrl, true)
        if (permission === 'clipboard-sanitized-write') {
            return webContents.isFocused() && isSecureBrowserClipboardUrl(requestingUrl)
        }
        return webContents.isFocused() && isSecureBrowserPermissionUrl(requestingUrl, false)
    })
    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (!isAuthorizedBrowserPermissionTarget(webContents) || !AUTOMATIC_BROWSER_PERMISSIONS.has(permission)) {
            callback(false)
            return
        }
        const requestingUrl = details.requestingUrl || webContents.getURL()
        const allowed = permission === 'mediaKeySystem'
            ? isSecureBrowserPermissionUrl(requestingUrl, true)
            : permission === 'clipboard-sanitized-write'
                ? webContents.isFocused() && isSecureBrowserClipboardUrl(requestingUrl)
                : webContents.isFocused() && isSecureBrowserPermissionUrl(requestingUrl, false)
        callback(allowed)
    })
    browserSession.setDevicePermissionHandler(() => false)
    getBrowserDownloadService().attachSession(browserSession, isAuthorizedBrowserPermissionTarget)
    if (browserSession.isPersistent()) {
        browserSession.cookies.on('changed', () => scheduleGlobalBrowserProfileFlush())
    }
}

export async function handleGetBrowserPageIcon(_event: IpcMainInvokeEvent, pageUrl: string) {
    return { success: true as const, dataUrl: await getBrowserPageIcon(pageUrl) }
}

export async function handleListBrowserDownloads(_event: IpcMainInvokeEvent) {
    return { success: true as const, downloads: getBrowserDownloadService().list() }
}

export async function handleListBrowserDownloadsFolder(_event: IpcMainInvokeEvent) {
    try {
        return { success: true as const, entries: await getBrowserDownloadService().listFolder() }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The Downloads folder could not be read.' }
    }
}

export async function handleBrowserDownloadsFolderAction(_event: IpcMainInvokeEvent, action: BrowserDownloadsFolderAction) {
    try {
        const openConfirmation = await getBrowserDownloadService().actOnFolderEntry(action)
        return { success: true as const, openConfirmation }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The Downloads-folder action failed.' }
    }
}

export async function handleGetBrowserDownloadPreviewTarget(_event: IpcMainInvokeEvent, id: string) {
    try {
        return { success: true as const, target: getBrowserDownloadService().previewTarget(id) }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The downloaded file cannot be previewed.' }
    }
}

export async function handleBrowserDownloadAction(_event: IpcMainInvokeEvent, action: BrowserDownloadAction) {
    try {
        const openConfirmation = await getBrowserDownloadService().act(action)
        return { success: true as const, downloads: getBrowserDownloadService().list(), openConfirmation }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The download action failed.' }
    }
}

export async function handleGetBrowserPreviewConfig(_event: IpcMainInvokeEvent) {
    try {
        const protectedMedia = getProtectedMediaStatus()
        void initializeProtectedMedia()
        getGlobalBrowserSession()
        return {
            success: true as const,
            partition: ZYRA_BROWSER_GLOBAL_PARTITION,
            webPreferences: ZYRA_BROWSER_WEB_PREFERENCES,
            profileScope: 'global' as const,
            persistent: true as const,
            protectedMedia
        }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to configure the local browser profile:', error)
        return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Failed to configure the local browser profile.'
        }
    }
}

function resolveThreatCheckGuest(event: IpcMainInvokeEvent, input: DevScopeBrowserThreatCheckInput) {
    const guestWebContentsId = Number(input?.guestWebContentsId)
    const tabId = String(input?.tabId || '')
    if (!Number.isSafeInteger(guestWebContentsId) || !isTrustedBrowserTabId(tabId)) {
        throw new Error('Browser tab identity is invalid.')
    }
    const entry = trustedBrowserGuests.findByGuestId(guestWebContentsId)
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
        throw new Error('The Browser guest is not available to this window.')
    }
    if (entry.tabId && entry.tabId !== tabId) {
        throw new Error('The Browser guest is bound to another tab.')
    }
    return entry
}

export async function handleCheckBrowserThreatNavigation(
    event: IpcMainInvokeEvent,
    input: DevScopeBrowserThreatCheckInput
) {
    try {
        const entry = resolveThreatCheckGuest(event, input)
        const url = String(input?.url || '').trim()
        if (!isSafeBrowserNavigationUrl(url)) {
            return { success: false as const, error: 'Only HTTP and HTTPS links can open in Browser.' }
        }
        const service = getBrowserThreatProtectionService()
        if (!service
            || service.consumeOneTimeAllowance(entry.guest.id, url)
            || service.consumeOneTimeOwnerAllowance(event.sender.id, url)) {
            return { success: true as const, allowed: true }
        }
        const warning = service.blockNavigation({
            ownerWebContentsId: event.sender.id,
            sourceGuestWebContentsId: entry.guest.id,
            blockedGuestWebContentsId: entry.guest.id,
            navigationKind: 'current-tab',
            previousUrl: entry.guest.getURL(),
            url,
            proceed: () => { void entry.guest.loadURL(url).catch((error) => log.debug('[BrowserThreatProtection] Allowed navigation failed.', error)) }
        })
        return { success: true as const, allowed: !warning }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The URL safety check failed.' }
    }
}

export async function handleProceedBrowserThreatWarning(event: IpcMainInvokeEvent, decisionId: string) {
    try {
        const service = getBrowserThreatProtectionService()
        if (!service) throw new Error('Browser phishing protection is not available.')
        await service.proceed(event.sender.id, String(decisionId || ''))
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The blocked navigation could not continue.' }
    }
}

export async function handleDismissBrowserThreatWarning(event: IpcMainInvokeEvent, decisionId: string) {
    try {
        const service = getBrowserThreatProtectionService()
        if (!service) throw new Error('Browser phishing protection is not available.')
        service.dismiss(event.sender.id, String(decisionId || ''))
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The blocked navigation could not be dismissed.' }
    }
}

export async function handleGetBrowserHistory(
    _event: IpcMainInvokeEvent,
    input?: { query?: string; limit?: number }
) {
    try {
        const entries = await getBrowserHistoryStore().list(input)
        return { success: true as const, entries }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to read Browser history:', error)
        return { success: false as const, error: error instanceof Error ? error.message : 'Failed to read Browser history.' }
    }
}

export async function handleGetBrowserSearchSuggestions(
    _event: IpcMainInvokeEvent,
    input?: { query?: string }
) {
    try {
        const suggestions = await fetchGoogleBrowserSearchSuggestions(String(input?.query || ''))
        return { success: true as const, suggestions, provider: 'Google' as const }
    } catch {
        return { success: true as const, suggestions: [], provider: 'Google' as const }
    }
}

export async function handleScanExternalBrowserHistoryProfiles(_event: IpcMainInvokeEvent) {
    try {
        const scan = await getExternalBrowserHistoryService().scan()
        return { success: true as const, ...scan }
    } catch (error: unknown) {
        log.warn('[BrowserPreview] External browser profile scan failed', { errorType: error instanceof Error ? error.name : 'UnknownError' })
        return { success: false as const, error: 'Could not scan browser profiles.' }
    }
}

export async function handleImportExternalBrowserHistory(
    _event: IpcMainInvokeEvent,
    input: ExternalBrowserHistoryImportInput
) {
    try {
        const result = await getExternalBrowserHistoryService().import(input)
        return { success: true as const, result }
    } catch (error: unknown) {
        log.warn('[BrowserPreview] External browser history import failed', { errorType: error instanceof Error ? error.name : 'UnknownError' })
        return { success: false as const, error: error instanceof Error && /expired|Select between|valid import start date/.test(error.message) ? error.message : 'Could not import browser history. Close the selected browser and retry.' }
    }
}

export async function handleRecordBrowserHistory(
    _event: IpcMainInvokeEvent,
    input: DevScopeBrowserHistoryRecordInput
) {
    try {
        const entry = await getBrowserHistoryStore().record(input)
        return { success: true as const, entry }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to record Browser history:', error)
        return { success: false as const, error: error instanceof Error ? error.message : 'Failed to record Browser history.' }
    }
}

export async function handleGetBrowserAdBlockStatus(_event: IpcMainInvokeEvent) {
    const service = getBrowserAdBlockService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load built-in ad blocking.' }
    return { success: true as const, status: service.status() }
}

export async function handleSetBrowserAdBlockEnabled(
    _event: IpcMainInvokeEvent,
    input?: { enabled?: boolean; promptDismissed?: boolean }
) {
    const service = getBrowserAdBlockService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load built-in ad blocking.' }
    try {
        const status = await service.setEnabled(input?.enabled === true, input?.promptDismissed === true)
        return { success: true as const, status }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Built-in ad blocking could not be configured.' }
    }
}

export async function handleGetBrowserBackgroundProviderStatus(_event: IpcMainInvokeEvent) {
    const service = getBrowserBackgroundService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load Browser backgrounds.' }
    return { success: true as const, status: await service.status() }
}

export async function handleValidateBrowserUnsplashAccessKey(
    _event: IpcMainInvokeEvent,
    input?: { accessKey?: string }
) {
    const service = getBrowserBackgroundService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load Browser backgrounds.' }
    try {
        await service.validateAccessKey(String(input?.accessKey || ''))
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'The Unsplash access key could not be verified.' }
    }
}

export async function handleGetBrowserRemoteBackgrounds(
    _event: IpcMainInvokeEvent,
    input?: { category?: DevScopeBrowserBackgroundCategory; refresh?: boolean; query?: string }
) {
    const service = getBrowserBackgroundService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load Browser backgrounds.' }
    try {
        const backgrounds = await service.list({ category: input?.category || 'all', refresh: input?.refresh === true, query: input?.query })
        return { success: true as const, backgrounds }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Unsplash backgrounds are unavailable right now.' }
    }
}

export async function handleTrackBrowserRemoteBackground(
    _event: IpcMainInvokeEvent,
    input?: { downloadLocation?: string }
) {
    const service = getBrowserBackgroundService()
    if (!service) return { success: false as const, error: 'Restart Zyra Desktop to load Browser backgrounds.' }
    try {
        await service.track(String(input?.downloadLocation || ''))
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Unsplash could not record the selected background.' }
    }
}

export async function handleClearBrowserHistory(_event: IpcMainInvokeEvent) {
    try {
        await getBrowserHistoryStore().clear()
        return { success: true as const, cleared: true as const }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to clear Browser history:', error)
        return { success: false as const, error: error instanceof Error ? error.message : 'Failed to clear Browser history.' }
    }
}

export async function handleClearBrowserPreviewData(_event: IpcMainInvokeEvent) {
    const historyStore = getBrowserHistoryStore()
    historyStore.suppressRecordingFor(30_000)
    try {
        const browserSession = getGlobalBrowserSession()
        await browserSession.clearStorageData()
        await browserSession.clearCache()
        await browserSession.clearAuthCache()
        await browserSession.cookies.flushStore()
        await Promise.all([...activeIncognitoSessions].map((activeSession) => Promise.allSettled([
            activeSession.clearStorageData(),
            activeSession.clearCache(),
            activeSession.clearAuthCache()
        ])))
        await historyStore.clear()
        return { success: true as const, cleared: true as const }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to clear local browser data:', error)
        return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Failed to clear local browser data.'
        }
    }
}

function cacheLinkPreview(url: string, preview: DevScopeBrowserLinkPreview | null): void {
    linkPreviewCache.delete(url)
    linkPreviewCache.set(url, {
        expiresAt: Date.now() + (preview ? LINK_PREVIEW_CACHE_TTL_MS : LINK_PREVIEW_NEGATIVE_CACHE_TTL_MS),
        preview
    })
    while (linkPreviewCache.size > LINK_PREVIEW_CACHE_LIMIT) {
        const oldestKey = linkPreviewCache.keys().next().value
        if (oldestKey === undefined) break
        linkPreviewCache.delete(oldestKey)
    }
}

export async function handleGetBrowserLinkPreview(
    _event: IpcMainInvokeEvent,
    input?: { url?: string }
) {
    const rawUrl = String(input?.url || '').trim()
    if (!isSafeBrowserNavigationUrl(rawUrl) || rawUrl.length > 2_048) {
        return { success: false as const, error: 'A valid HTTP or HTTPS link is required.' }
    }
    const url = new URL(rawUrl)
    url.hash = ''
    const cacheKey = url.toString()
    const cached = linkPreviewCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
        linkPreviewCache.delete(cacheKey)
        linkPreviewCache.set(cacheKey, cached)
        return { success: true as const, preview: cached.preview }
    }
    if (cached) linkPreviewCache.delete(cacheKey)

    let pending = pendingLinkPreviews.get(cacheKey)
    if (!pending) {
        if (pendingLinkPreviews.size >= LINK_PREVIEW_PENDING_LIMIT) {
            return { success: true as const, preview: null }
        }
        pending = scheduleLinkPreview(() => fetchBrowserLinkPreview(cacheKey)).finally(() => {
            pendingLinkPreviews.delete(cacheKey)
        })
        pendingLinkPreviews.set(cacheKey, pending)
    }
    const preview = await pending
    cacheLinkPreview(cacheKey, preview)
    return { success: true as const, preview }
}

export async function handleOpenBrowserPreviewExternal(
    _event: IpcMainInvokeEvent,
    rawUrl: string
) {
    try {
        const url = String(rawUrl || '').trim()
        if (!isSafeBrowserNavigationUrl(url)) {
            return { success: false as const, error: 'Only HTTP and HTTPS links can open externally.' }
        }
        await shell.openExternal(url)
        return { success: true as const }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to open external URL:', error)
        return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Failed to open the browser.'
        }
    }
}
