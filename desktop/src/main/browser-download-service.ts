import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { lstat, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { app, shell, webContents, type DownloadItem, type Session, type WebContents } from 'electron'
import log from 'electron-log'
import {
    browserDownloadNeedsInternetZone,
    classifyBrowserDownload
} from '../shared/browser-download-guard'
import {
    BROWSER_DOWNLOADS_CHANGED_CHANNEL,
    type BrowserDownloadAction,
    type BrowserDownloadOpenConfirmation,
    type BrowserDownloadPreviewTarget,
    type BrowserDownloadRecord,
    type BrowserDownloadProtectionStatus,
    type BrowserDownloadStatus,
    type BrowserDownloadsFolderAction,
    type BrowserDownloadsFolderEntry,
    type BrowserDownloadsFolderOpenConfirmation
} from '../shared/browser-downloads'
import { writeJsonAtomically } from './setup/atomic-json'

const DOWNLOAD_HISTORY_LIMIT = 200
const DOWNLOAD_FOLDER_ENTRY_LIMIT = 200
const DOWNLOAD_FOLDER_SCAN_LIMIT = 1_000
const DOWNLOAD_FOLDER_ICON_CONCURRENCY = 6
const DOWNLOAD_PROGRESS_BROADCAST_MS = 100
const DOWNLOAD_STORE_VERSION = 1
const OPEN_CONFIRMATION_LIFETIME_MS = 60_000
const WINDOWS_INTERNET_ZONE_MARK = '[ZoneTransfer]\r\nZoneId=3\r\n'

type StoredDownload = Omit<BrowserDownloadRecord, 'systemIconDataUrl'> & {
    savePath: string
}

type LiveDownload = {
    item: DownloadItem
    sourceWebContentsId: number
    retryUrl: string
    lastBroadcastAt: number
}

type StoredDownloadFile = {
    version: 1
    downloads: StoredDownload[]
}

function safeSourceOrigin(value: string): string {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

function safeFilename(value: string): string {
    let name = basename(String(value || '').replace(/[\u0000-\u001f]/g, '')).trim()
    if (process.platform === 'win32') {
        name = name.replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '')
        if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
    }
    return (name || 'download').slice(0, 180)
}

function safeProtectionStatus(value: unknown, sourceOrigin: string): BrowserDownloadProtectionStatus {
    if (process.platform !== 'win32' || !browserDownloadNeedsInternetZone(sourceOrigin)) return 'not-required'
    return value === 'applied' || value === 'failed' ? value : 'pending'
}

function shouldLoadSystemIcon(record: StoredDownload): boolean {
    return record.risk === 'dangerous' || extname(record.filename).toLowerCase() === '.exe'
}

function pathKey(value: string): string {
    const normalized = resolve(value)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
    const root = pathKey(rootPath)
    const candidate = pathKey(candidatePath)
    const separator = process.platform === 'win32' ? '\\' : '/'
    return candidate === root || candidate.startsWith(`${root}${separator}`)
}

function initialStoredDownloads(filePath: string, downloadsRoot: string): StoredDownload[] {
    if (!existsSync(filePath)) return []
    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<StoredDownloadFile>
        if (parsed.version !== DOWNLOAD_STORE_VERSION || !Array.isArray(parsed.downloads)) return []
        return parsed.downloads.flatMap((candidate) => {
            if (!candidate || typeof candidate !== 'object') return []
            const savePath = String(candidate.savePath || '')
            if (!savePath || !isPathInside(downloadsRoot, savePath)) return []
            const sourceOrigin = safeSourceOrigin(candidate.sourceOrigin)
            const filename = safeFilename(candidate.filename)
            const status: BrowserDownloadStatus = candidate.status === 'completed'
                ? 'completed'
                : candidate.status === 'cancelled'
                    ? 'cancelled'
                    : candidate.status === 'blocked'
                        ? 'blocked'
                        : 'interrupted'
            return [{
                id: String(candidate.id || randomUUID()),
                filename,
                sourceOrigin,
                mimeType: String(candidate.mimeType || '').slice(0, 160),
                status,
                receivedBytes: Math.max(0, Number(candidate.receivedBytes) || 0),
                totalBytes: Math.max(0, Number(candidate.totalBytes) || 0),
                bytesPerSecond: 0,
                startedAt: String(candidate.startedAt || new Date().toISOString()),
                updatedAt: String(candidate.updatedAt || candidate.startedAt || new Date().toISOString()),
                completedAt: candidate.completedAt ? String(candidate.completedAt) : null,
                canResume: false,
                canRetry: false,
                exists: status === 'completed' && existsSync(savePath),
                risk: classifyBrowserDownload(filename, sourceOrigin),
                protectionStatus: safeProtectionStatus(candidate.protectionStatus, sourceOrigin),
                savePath
            } satisfies StoredDownload]
        }).slice(0, DOWNLOAD_HISTORY_LIMIT)
    } catch (error) {
        log.warn('[BrowserDownloads] Could not read download history.', error)
        return []
    }
}

export class BrowserDownloadService {
    private readonly downloadsRoot: string
    private readonly storePath: string
    private readonly records = new Map<string, StoredDownload>()
    private readonly live = new Map<string, LiveDownload>()
    private readonly retrySources = new Map<string, { sourceWebContentsId: number; url: string }>()
    private readonly ownersByTarget = new Map<number, WebContents>()
    private readonly ownerContents = new Map<number, WebContents>()
    private readonly attachedSessions = new WeakSet<Session>()
    private readonly reservedPaths = new Set<string>()
    private readonly systemIcons = new Map<string, string>()
    private readonly pendingSystemIcons = new Set<string>()
    private readonly pendingOpenConfirmations = new Map<string, { token: string; expiresAt: number }>()
    private readonly folderSystemIcons = new Map<string, { signature: string; dataUrl: string }>()
    private readonly pendingFolderOpenConfirmations = new Map<string, { token: string; expiresAt: number }>()
    private persistChain: Promise<void> = Promise.resolve()
    private publishTimer: ReturnType<typeof setTimeout> | null = null

    constructor() {
        this.downloadsRoot = app.getPath('downloads')
        this.storePath = join(app.getPath('userData'), 'browser-preview', 'downloads-v1.json')
        for (const record of initialStoredDownloads(this.storePath, this.downloadsRoot)) this.records.set(record.id, record)
    }

    registerTarget(target: WebContents, owner: WebContents | null = target.hostWebContents): void {
        if (!owner || owner.isDestroyed()) return
        this.ownersByTarget.set(target.id, owner)
        this.ownerContents.set(owner.id, owner)
        target.once('destroyed', () => {
            this.ownersByTarget.delete(target.id)
            if (![...this.ownersByTarget.values()].some((candidate) => candidate.id === owner.id)) this.ownerContents.delete(owner.id)
        })
        owner.once('destroyed', () => this.ownerContents.delete(owner.id))
    }

    transferTargetOwner(target: WebContents, owner: WebContents): void {
        if (target.isDestroyed() || owner.isDestroyed()) return
        const previousOwner = this.ownersByTarget.get(target.id)
        this.ownersByTarget.set(target.id, owner)
        this.ownerContents.set(owner.id, owner)
        if (previousOwner && ![...this.ownersByTarget.values()].some((candidate) => candidate.id === previousOwner.id)) {
            this.ownerContents.delete(previousOwner.id)
        }
        target.once('destroyed', () => {
            this.ownersByTarget.delete(target.id)
            if (![...this.ownersByTarget.values()].some((candidate) => candidate.id === owner.id)) this.ownerContents.delete(owner.id)
        })
        owner.once('destroyed', () => this.ownerContents.delete(owner.id))
        this.publish()
    }

    attachSession(browserSession: Session, isAuthorizedTarget: (contents: WebContents | null) => boolean): void {
        if (this.attachedSessions.has(browserSession)) return
        this.attachedSessions.add(browserSession)
        browserSession.on('will-download', (event, item, sourceContents) => {
            if (!isAuthorizedTarget(sourceContents)) {
                event.preventDefault()
                return
            }
            this.startDownload(item, sourceContents)
        })
    }

    list(): BrowserDownloadRecord[] {
        for (const record of this.records.values()) {
            if (record.status !== 'completed' || !record.exists || !shouldLoadSystemIcon(record)) continue
            if (record.protectionStatus === 'pending') void this.finalizeCompletedDownload(record)
            else void this.loadSystemIcon(record)
        }
        return [...this.records.values()]
            .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
            .slice(0, DOWNLOAD_HISTORY_LIMIT)
            .map(({ savePath: _savePath, ...record }) => ({
                ...record,
                exists: record.status === 'completed' ? existsSync(_savePath) : false,
                systemIconDataUrl: this.systemIcons.get(record.id) || null
            }))
    }

    async listFolder(): Promise<BrowserDownloadsFolderEntry[]> {
        const dirents = await readdir(this.downloadsRoot, { withFileTypes: true })
        const files = (await Promise.all(
            dirents
                .filter((dirent) => dirent.isFile())
                .slice(0, DOWNLOAD_FOLDER_SCAN_LIMIT)
                .map(async (dirent) => {
                    const filePath = this.resolveFolderFilePath(dirent.name)
                    try {
                        const fileStats = await lstat(filePath)
                        if (!fileStats.isFile() || fileStats.isSymbolicLink()) return null
                        const entry: BrowserDownloadsFolderEntry = {
                            filename: dirent.name,
                            size: fileStats.size,
                            modifiedAt: fileStats.mtime.toISOString(),
                            risk: classifyBrowserDownload(dirent.name, ''),
                            systemIconDataUrl: null
                        }
                        return {
                            filePath,
                            signature: `${fileStats.size}:${fileStats.mtimeMs}`,
                            entry
                        }
                    } catch {
                        return null
                    }
                })
        ))
            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
            .sort((left, right) => right.entry.modifiedAt.localeCompare(left.entry.modifiedAt))
            .slice(0, DOWNLOAD_FOLDER_ENTRY_LIMIT)

        const retainedIconKeys = new Set(files.map(({ filePath }) => pathKey(filePath)))
        for (const key of this.folderSystemIcons.keys()) {
            if (!retainedIconKeys.has(key)) this.folderSystemIcons.delete(key)
        }
        const iconCandidates = files.filter(({ entry }) => entry.risk === 'dangerous' || extname(entry.filename).toLowerCase() === '.exe')
        let iconCursor = 0
        await Promise.all(Array.from({ length: Math.min(DOWNLOAD_FOLDER_ICON_CONCURRENCY, iconCandidates.length) }, async () => {
            while (iconCursor < iconCandidates.length) {
                const candidate = iconCandidates[iconCursor]
                iconCursor += 1
                candidate.entry.systemIconDataUrl = await this.loadFolderSystemIcon(candidate.filePath, candidate.signature)
            }
        }))
        return files.map(({ entry }) => entry)
    }

    async actOnFolderEntry(action: BrowserDownloadsFolderAction): Promise<BrowserDownloadsFolderOpenConfirmation | null> {
        if (!action || typeof action !== 'object' || !['open', 'confirm-open', 'reveal'].includes(action.type)) {
            throw new Error('The Downloads-folder action is invalid.')
        }
        if (action.type === 'confirm-open' && (typeof action.token !== 'string' || !action.token)) {
            throw new Error('The open confirmation is invalid.')
        }
        const now = Date.now()
        for (const [key, confirmation] of this.pendingFolderOpenConfirmations) {
            if (confirmation.expiresAt < now) this.pendingFolderOpenConfirmations.delete(key)
        }
        const filePath = this.resolveFolderFilePath(action.filename)
        const fileStats = await lstat(filePath)
        if (!fileStats.isFile() || fileStats.isSymbolicLink()) throw new Error('This Downloads item is not a regular file.')
        if (action.type === 'reveal') {
            shell.showItemInFolder(filePath)
            return null
        }
        const risk = classifyBrowserDownload(action.filename, '')
        if (action.type === 'open' && risk === 'dangerous') {
            const token = randomUUID()
            const expiresAt = now + OPEN_CONFIRMATION_LIFETIME_MS
            this.pendingFolderOpenConfirmations.set(pathKey(filePath), { token, expiresAt })
            return { filename: action.filename, token, expiresAt: new Date(expiresAt).toISOString() }
        }
        if (action.type === 'confirm-open') {
            const key = pathKey(filePath)
            const confirmation = this.pendingFolderOpenConfirmations.get(key)
            this.pendingFolderOpenConfirmations.delete(key)
            if (!confirmation || confirmation.token !== action.token || confirmation.expiresAt < Date.now()) {
                throw new Error('The open confirmation expired. Try opening the file again.')
            }
            if (risk !== 'dangerous') throw new Error('This file does not require a dangerous-file confirmation.')
        }
        const error = await shell.openPath(filePath)
        if (error) throw new Error(error)
        return null
    }

    previewTarget(id: string): BrowserDownloadPreviewTarget {
        const record = this.records.get(String(id || ''))
        if (!record) throw new Error('Download not found.')
        if (!isPathInside(this.downloadsRoot, record.savePath)) throw new Error('The download path is invalid.')
        if (!existsSync(record.savePath)) throw new Error('The downloaded file is no longer available.')
        return {
            name: record.filename,
            path: record.savePath,
            extension: extname(record.filename).replace(/^\./, '').toLowerCase()
        }
    }

    async act(action: BrowserDownloadAction): Promise<BrowserDownloadOpenConfirmation | null> {
        if (action.type === 'open-folder') {
            const error = await shell.openPath(this.downloadsRoot)
            if (error) throw new Error(error)
            return null
        }
        if (action.type === 'clear-history') {
            for (const [id, record] of this.records) {
                if (!this.live.has(id)) this.records.delete(id)
                if (!this.live.has(id)) this.retrySources.delete(id)
                if (!this.live.has(id)) this.systemIcons.delete(id)
                if (!this.live.has(id)) this.pendingOpenConfirmations.delete(id)
                if (record.status === 'progressing' || record.status === 'paused') continue
            }
            this.commit()
            return null
        }

        const record = this.records.get(action.id)
        if (!record) throw new Error('Download not found.')
        const live = this.live.get(action.id)
        if (action.type === 'pause') {
            if (!live || record.status !== 'progressing') throw new Error('This download cannot be paused.')
            live.item.pause()
            record.status = 'paused'
            record.canResume = live.item.canResume()
            this.touch(record)
            return null
        }
        if (action.type === 'resume') {
            if (!live || (record.status !== 'paused' && record.status !== 'interrupted') || !live.item.canResume()) throw new Error('This download cannot be resumed.')
            live.item.resume()
            record.status = 'progressing'
            record.canResume = live.item.canResume()
            this.touch(record)
            return null
        }
        if (action.type === 'cancel') {
            if (!live) throw new Error('This download is no longer active.')
            live.item.cancel()
            return null
        }
        if (action.type === 'retry') {
            const retry = this.retrySources.get(action.id)
            const sourceContents = retry ? webContents.fromId(retry.sourceWebContentsId) : null
            if (!retry || !sourceContents || sourceContents.isDestroyed()) throw new Error('Reopen the download page to retry this item.')
            sourceContents.downloadURL(retry.url)
            return null
        }
        if (!isPathInside(this.downloadsRoot, record.savePath)) throw new Error('The download path is invalid.')
        if (action.type === 'delete') {
            if (live) throw new Error('Cancel the active download before deleting it.')
            if (!existsSync(record.savePath)) throw new Error('The downloaded file is no longer available.')
            await unlink(record.savePath)
            this.records.delete(action.id)
            this.retrySources.delete(action.id)
            this.systemIcons.delete(action.id)
            this.pendingOpenConfirmations.delete(action.id)
            this.commit()
            return null
        }
        if (!existsSync(record.savePath)) throw new Error('The downloaded file is no longer available.')
        if (action.type === 'open') {
            await this.ensureInternetZoneMark(record)
            if (record.risk === 'dangerous') {
                const token = randomUUID()
                const expiresAt = Date.now() + OPEN_CONFIRMATION_LIFETIME_MS
                this.pendingOpenConfirmations.set(record.id, { token, expiresAt })
                return { id: record.id, token, expiresAt: new Date(expiresAt).toISOString() }
            }
            const error = await shell.openPath(record.savePath)
            if (error) throw new Error(error)
            return null
        }
        if (action.type === 'confirm-open') {
            const confirmation = this.pendingOpenConfirmations.get(record.id)
            this.pendingOpenConfirmations.delete(record.id)
            if (!confirmation || confirmation.token !== action.token || confirmation.expiresAt < Date.now()) {
                throw new Error('The open confirmation expired. Try opening the file again.')
            }
            if (record.risk !== 'dangerous') throw new Error('This file does not require a dangerous-file confirmation.')
            await this.ensureInternetZoneMark(record)
            const error = await shell.openPath(record.savePath)
            if (error) throw new Error(error)
            return null
        }
        shell.showItemInFolder(record.savePath)
        return null
    }

    clear(): void {
        for (const live of this.live.values()) live.item.cancel()
        this.live.clear()
        this.retrySources.clear()
        this.records.clear()
        this.reservedPaths.clear()
        this.systemIcons.clear()
        this.pendingSystemIcons.clear()
        this.pendingOpenConfirmations.clear()
        this.folderSystemIcons.clear()
        this.pendingFolderOpenConfirmations.clear()
        this.commit()
    }

    private startDownload(item: DownloadItem, sourceContents: WebContents): void {
        const id = randomUUID()
        const now = new Date().toISOString()
        const filename = safeFilename(item.getFilename())
        const savePath = this.reserveSavePath(filename)
        const sourceOrigin = safeSourceOrigin(item.getURL())
        item.setSavePath(savePath)
        const record: StoredDownload = {
            id,
            filename: basename(savePath),
            sourceOrigin,
            mimeType: String(item.getMimeType() || '').slice(0, 160),
            status: 'progressing',
            receivedBytes: Math.max(0, item.getReceivedBytes()),
            totalBytes: Math.max(0, item.getTotalBytes()),
            bytesPerSecond: Math.max(0, item.getCurrentBytesPerSecond()),
            startedAt: now,
            updatedAt: now,
            completedAt: null,
            canResume: item.canResume(),
            canRetry: true,
            exists: false,
            risk: classifyBrowserDownload(basename(savePath), sourceOrigin),
            protectionStatus: safeProtectionStatus(undefined, sourceOrigin),
            savePath
        }
        this.records.set(id, record)
        this.live.set(id, { item, sourceWebContentsId: sourceContents.id, retryUrl: item.getURL(), lastBroadcastAt: 0 })
        this.retrySources.set(id, { sourceWebContentsId: sourceContents.id, url: item.getURL() })
        this.trimHistory()
        this.commit()

        item.on('updated', (_event, state) => {
            const current = this.records.get(id)
            const active = this.live.get(id)
            if (!current || !active) return
            current.receivedBytes = Math.max(0, item.getReceivedBytes())
            current.totalBytes = Math.max(0, item.getTotalBytes())
            current.bytesPerSecond = Math.max(0, item.getCurrentBytesPerSecond())
            current.canResume = item.canResume()
            current.status = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
            current.updatedAt = new Date().toISOString()
            const nowMs = Date.now()
            if (nowMs - active.lastBroadcastAt >= DOWNLOAD_PROGRESS_BROADCAST_MS || state === 'interrupted') {
                active.lastBroadcastAt = nowMs
                this.publish()
            }
        })
        item.once('done', (_event, state) => {
            const current = this.records.get(id)
            if (!current) return
            this.live.delete(id)
            this.reservedPaths.delete(pathKey(savePath))
            current.receivedBytes = Math.max(0, item.getReceivedBytes())
            current.totalBytes = Math.max(0, item.getTotalBytes())
            current.bytesPerSecond = 0
            current.status = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
            current.canResume = false
            current.canRetry = state !== 'completed'
            current.exists = state === 'completed' && existsSync(savePath)
            current.updatedAt = new Date().toISOString()
            current.completedAt = current.updatedAt
            this.commit()
            if (state === 'completed') void this.finalizeCompletedDownload(current)
        })
    }

    private async finalizeCompletedDownload(record: StoredDownload): Promise<void> {
        await this.ensureInternetZoneMark(record)
        if (shouldLoadSystemIcon(record)) await this.loadSystemIcon(record)
    }

    private async ensureInternetZoneMark(record: StoredDownload): Promise<void> {
        if (process.platform !== 'win32' || !browserDownloadNeedsInternetZone(record.sourceOrigin)) {
            if (record.protectionStatus !== 'not-required') {
                record.protectionStatus = 'not-required'
                this.touch(record)
            }
            return
        }
        try {
            await writeFile(`${record.savePath}:Zone.Identifier`, WINDOWS_INTERNET_ZONE_MARK, { encoding: 'utf8' })
            record.protectionStatus = 'applied'
        } catch (error) {
            record.protectionStatus = 'failed'
            log.warn('[BrowserDownloads] Could not apply Windows internet-zone metadata.', error)
        }
        this.touch(record)
    }

    private async loadSystemIcon(record: StoredDownload): Promise<void> {
        if (this.systemIcons.has(record.id) || this.pendingSystemIcons.has(record.id) || !existsSync(record.savePath)) return
        this.pendingSystemIcons.add(record.id)
        try {
            const icon = await app.getFileIcon(record.savePath, { size: 'normal' })
            if (icon.isEmpty()) return
            const dataUrl = icon.toDataURL()
            if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 100_000) return
            this.systemIcons.set(record.id, dataUrl)
            this.publish()
        } catch (error) {
            log.debug('[BrowserDownloads] Could not load the downloaded file icon.', error)
        } finally {
            this.pendingSystemIcons.delete(record.id)
        }
    }

    private resolveFolderFilePath(filenameValue: string): string {
        const filename = String(filenameValue || '')
        if (!filename || filename.includes('\u0000') || filename === '.' || filename === '..' || basename(filename) !== filename) {
            throw new Error('The Downloads filename is invalid.')
        }
        const filePath = join(this.downloadsRoot, filename)
        if (!isPathInside(this.downloadsRoot, filePath)) throw new Error('The Downloads path is invalid.')
        return filePath
    }

    private async loadFolderSystemIcon(filePath: string, signature: string): Promise<string | null> {
        const key = pathKey(filePath)
        const cached = this.folderSystemIcons.get(key)
        if (cached?.signature === signature) return cached.dataUrl
        try {
            const icon = await app.getFileIcon(filePath, { size: 'normal' })
            if (icon.isEmpty()) return null
            const dataUrl = icon.toDataURL()
            if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 100_000) return null
            this.folderSystemIcons.set(key, { signature, dataUrl })
            return dataUrl
        } catch (error) {
            log.debug('[BrowserDownloads] Could not load a Downloads-folder file icon.', error)
            return null
        }
    }

    private reserveSavePath(filename: string): string {
        const extension = extname(filename)
        const stem = filename.slice(0, Math.max(0, filename.length - extension.length)) || 'download'
        for (let suffix = 0; suffix < 10_000; suffix += 1) {
            const candidateName = suffix === 0 ? `${stem}${extension}` : `${stem} (${suffix})${extension}`
            const candidate = join(this.downloadsRoot, candidateName)
            const key = pathKey(candidate)
            if (this.reservedPaths.has(key) || existsSync(candidate)) continue
            this.reservedPaths.add(key)
            return candidate
        }
        const fallback = join(this.downloadsRoot, `${stem}-${Date.now()}${extension}`)
        this.reservedPaths.add(pathKey(fallback))
        return fallback
    }

    private touch(record: StoredDownload): void {
        record.updatedAt = new Date().toISOString()
        this.commit()
    }

    private trimHistory(): void {
        const retained = [...this.records.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        for (const record of retained.slice(DOWNLOAD_HISTORY_LIMIT)) {
            if (this.live.has(record.id)) continue
            this.records.delete(record.id)
            this.retrySources.delete(record.id)
            this.systemIcons.delete(record.id)
            this.pendingOpenConfirmations.delete(record.id)
        }
    }

    private commit(): void {
        this.trimHistory()
        this.publish()
        const snapshot: StoredDownloadFile = {
            version: DOWNLOAD_STORE_VERSION,
            downloads: [...this.records.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, DOWNLOAD_HISTORY_LIMIT)
        }
        this.persistChain = this.persistChain
            .catch(() => undefined)
            .then(() => writeJsonAtomically(this.storePath, snapshot))
            .catch((error) => log.warn('[BrowserDownloads] Could not persist download history.', error))
    }

    private publish(): void {
        if (this.publishTimer) return
        this.publishTimer = setTimeout(() => {
            this.publishTimer = null
            const downloads = this.list()
            for (const owner of this.ownerContents.values()) {
                if (!owner.isDestroyed()) owner.send(BROWSER_DOWNLOADS_CHANGED_CHANNEL, downloads)
            }
        }, 16)
    }
}

let browserDownloadService: BrowserDownloadService | null = null

export function getBrowserDownloadService(): BrowserDownloadService {
    browserDownloadService ||= new BrowserDownloadService()
    return browserDownloadService
}
