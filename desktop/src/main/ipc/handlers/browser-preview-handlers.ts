import { createHash } from 'crypto'
import { session, shell, type IpcMainInvokeEvent, type Session } from 'electron'
import log from 'electron-log'
import type { DevScopeBrowserLinkPreview } from '../../../shared/contracts/devscope-api'
import { fetchBrowserLinkPreview } from './browser-link-preview'

export const ZYRA_BROWSER_PARTITION_PREFIX = 'persist:zyra-browser-'
export const ZYRA_BROWSER_WEB_PREFERENCES = 'contextIsolation=true,sandbox=true,nodeIntegration=false'
const ZYRA_BROWSER_GLOBAL_PROFILE_KEY = 'zyra-global-browser-profile:v1'
const configuredPartitions = new Set<string>()
const LINK_PREVIEW_CACHE_LIMIT = 100
const LINK_PREVIEW_PENDING_LIMIT = 100
const LINK_PREVIEW_CONCURRENCY_LIMIT = 4
const LINK_PREVIEW_CACHE_TTL_MS = 15 * 60 * 1000
const LINK_PREVIEW_NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1000
const linkPreviewCache = new Map<string, { expiresAt: number; preview: DevScopeBrowserLinkPreview | null }>()
const pendingLinkPreviews = new Map<string, Promise<DevScopeBrowserLinkPreview | null>>()
const queuedLinkPreviewTasks: Array<() => void> = []
let activeLinkPreviewTasks = 0

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

function getGlobalBrowserSession(): Session {
    const browserSession = session.fromPartition(ZYRA_BROWSER_GLOBAL_PARTITION, { cache: true })
    configureBrowserSession(browserSession, ZYRA_BROWSER_GLOBAL_PARTITION)
    return browserSession
}

function configureBrowserSession(browserSession: Session, partition: string): void {
    if (configuredPartitions.has(partition)) return
    configuredPartitions.add(partition)

    const userAgent = browserSession.getUserAgent().replace(/Electron\/[\d.]+\s*/g, '')
    browserSession.setUserAgent(userAgent)
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    browserSession.setDevicePermissionHandler(() => false)
    browserSession.on('will-download', (event) => event.preventDefault())
}

export async function handleGetBrowserPreviewConfig(_event: IpcMainInvokeEvent) {
    try {
        getGlobalBrowserSession()
        return {
            success: true as const,
            partition: ZYRA_BROWSER_GLOBAL_PARTITION,
            webPreferences: ZYRA_BROWSER_WEB_PREFERENCES,
            profileScope: 'global' as const,
            persistent: true as const
        }
    } catch (error: unknown) {
        log.error('[BrowserPreview] Failed to configure the local browser profile:', error)
        return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Failed to configure the local browser profile.'
        }
    }
}

export async function handleClearBrowserPreviewData(_event: IpcMainInvokeEvent) {
    try {
        const browserSession = getGlobalBrowserSession()
        await browserSession.clearStorageData()
        await browserSession.clearCache()
        await browserSession.clearAuthCache()
        await browserSession.cookies.flushStore()
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
