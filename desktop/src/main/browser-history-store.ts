import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DevScopeBrowserHistoryEntry, DevScopeBrowserHistoryRecordInput } from '../shared/contracts/devscope-api'
import { isAuthenticationBrowserUrl, isSensitiveBrowserQueryKey, sanitizeBrowserPersistentUrl } from '../shared/browser-url-sanitization'
import { writeJsonAtomically } from './setup/atomic-json'

const BROWSER_HISTORY_SCHEMA_VERSION = 1
const BROWSER_HISTORY_ENTRY_LIMIT = 1_000
const BROWSER_HISTORY_QUERY_LIMIT = 256
const BROWSER_HISTORY_RESULT_LIMIT = 50
const BROWSER_HISTORY_URL_LIMIT = 2_048
const BROWSER_HISTORY_TITLE_LIMIT = 256
const BROWSER_HISTORY_FAVICON_LIMIT = 8_192

export type BrowserHistoryImportEntry = {
    url: string
    title: string
    visitCount: number
    lastVisitedAt: string
}

type BrowserHistoryFile = {
    version: 1
    entries: DevScopeBrowserHistoryEntry[]
}

export const isSensitiveBrowserHistoryQueryKey = isSensitiveBrowserQueryKey

function normalizeHistoryUrl(value: unknown): string | null {
    return sanitizeBrowserPersistentUrl(value, BROWSER_HISTORY_URL_LIMIT)
}

function normalizeHistoryTitle(value: unknown, url: string, authenticationUrl = isAuthenticationBrowserUrl(url)): string {
    if (authenticationUrl) {
        try {
            return new URL(url).hostname.slice(0, BROWSER_HISTORY_TITLE_LIMIT)
        } catch {
            return 'Sign in'
        }
    }
    const title = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    if (title) return title.slice(0, BROWSER_HISTORY_TITLE_LIMIT)
    try {
        return new URL(url).hostname.slice(0, BROWSER_HISTORY_TITLE_LIMIT)
    } catch {
        return 'Page'
    }
}

function normalizeHistoryFavicon(value: unknown): string | null {
    const candidate = String(value || '').trim()
    if (!candidate || candidate.length > BROWSER_HISTORY_FAVICON_LIMIT) return null
    if (/^data:image\/(?:png|gif|jpe?g|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(candidate)) return candidate
    try {
        const url = new URL(candidate)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        return sanitizeBrowserPersistentUrl(url.toString(), BROWSER_HISTORY_FAVICON_LIMIT)
    } catch {
        return null
    }
}

function normalizeTimestamp(value: unknown): string {
    const timestamp = Date.parse(String(value || ''))
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

function normalizeStoredEntry(value: unknown): DevScopeBrowserHistoryEntry | null {
    if (!value || typeof value !== 'object') return null
    const input = value as Partial<DevScopeBrowserHistoryEntry>
    const rawUrl = String(input.url || '')
    const url = normalizeHistoryUrl(rawUrl)
    if (!url) return null
    const visitCount = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(input.visitCount) || 1)))
    return {
        url,
        title: normalizeHistoryTitle(input.title, url, isAuthenticationBrowserUrl(rawUrl)),
        faviconUrl: normalizeHistoryFavicon(input.faviconUrl),
        lastVisitedAt: normalizeTimestamp(input.lastVisitedAt),
        visitCount
    }
}

export function getBrowserHistoryFilePath(userDataPath: string): string {
    return join(userDataPath, 'browser-preview', 'history-v1.json')
}

export class BrowserHistoryStore {
    private loaded = false
    private entries: DevScopeBrowserHistoryEntry[] = []
    private operationQueue: Promise<void> = Promise.resolve()
    private recordingSuppressedUntil = 0

    constructor(private readonly filePath: string) {}

    list(input?: { query?: string; limit?: number }): Promise<DevScopeBrowserHistoryEntry[]> {
        return this.run(async () => {
            await this.load()
            const query = String(input?.query || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().toLowerCase().slice(0, BROWSER_HISTORY_QUERY_LIMIT)
            const limit = Math.max(1, Math.min(BROWSER_HISTORY_RESULT_LIMIT, Math.floor(Number(input?.limit) || 20)))
            const entries = query
                ? this.entries.filter((entry) => entry.title.toLowerCase().includes(query) || entry.url.toLowerCase().includes(query))
                : this.entries
            return entries.slice(0, limit).map((entry) => ({ ...entry }))
        })
    }

    suppressRecordingFor(durationMs: number): void {
        const boundedDuration = Math.max(0, Math.min(60_000, Math.floor(Number(durationMs) || 0)))
        this.recordingSuppressedUntil = Math.max(this.recordingSuppressedUntil, Date.now() + boundedDuration)
    }

    record(input: DevScopeBrowserHistoryRecordInput): Promise<DevScopeBrowserHistoryEntry | null> {
        return this.run(async () => {
            await this.load()
            if (Date.now() < this.recordingSuppressedUntil) return null
            const rawUrl = String(input.url || '')
            const url = normalizeHistoryUrl(rawUrl)
            if (!url) return null
            const existingIndex = this.entries.findIndex((entry) => entry.url === url)
            const existing = existingIndex >= 0 ? this.entries[existingIndex] : null
            const incrementVisit = input.incrementVisit !== false
            if (!incrementVisit && !existing) return null
            const entry: DevScopeBrowserHistoryEntry = {
                url,
                title: normalizeHistoryTitle(input.title || existing?.title, url, isAuthenticationBrowserUrl(rawUrl)),
                faviconUrl: normalizeHistoryFavicon(input.faviconUrl) || existing?.faviconUrl || null,
                lastVisitedAt: incrementVisit || !existing ? new Date().toISOString() : existing.lastVisitedAt,
                visitCount: incrementVisit
                    ? Math.min(Number.MAX_SAFE_INTEGER, (existing?.visitCount || 0) + 1)
                    : existing?.visitCount || 1
            }
            if (!incrementVisit && existing && existing.title === entry.title && existing.faviconUrl === entry.faviconUrl) {
                return { ...existing }
            }
            if (existingIndex >= 0) this.entries.splice(existingIndex, 1)
            if (incrementVisit || !existing) this.entries.unshift(entry)
            else this.entries.splice(existingIndex, 0, entry)
            if (this.entries.length > BROWSER_HISTORY_ENTRY_LIMIT) this.entries.length = BROWSER_HISTORY_ENTRY_LIMIT
            await this.persist()
            return { ...entry }
        })
    }

    importEntries(importedEntries: BrowserHistoryImportEntry[]): Promise<{ added: number; updated: number; duplicatesMerged: number; skipped: number }> {
        return this.run(async () => {
            await this.load()
            const importedByUrl = new Map<string, BrowserHistoryImportEntry>()
            let skipped = 0
            let duplicatesMerged = 0
            const boundedImportedEntries = importedEntries.slice(0, 100_000)
            skipped += Math.max(0, importedEntries.length - boundedImportedEntries.length)
            for (const candidate of boundedImportedEntries) {
                const rawUrl = String(candidate.url || '')
                const url = normalizeHistoryUrl(rawUrl)
                const timestamp = Date.parse(String(candidate.lastVisitedAt || ''))
                if (!url || !Number.isFinite(timestamp) || timestamp < Date.UTC(1990, 0, 1) || timestamp > Date.now() + 24 * 60 * 60_000) {
                    skipped += 1
                    continue
                }
                const entry: BrowserHistoryImportEntry = {
                    url,
                    title: normalizeHistoryTitle(candidate.title, url, isAuthenticationBrowserUrl(rawUrl)),
                    visitCount: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(candidate.visitCount) || 1))),
                    lastVisitedAt: new Date(timestamp).toISOString()
                }
                const existing = importedByUrl.get(url)
                if (existing) {
                    duplicatesMerged += 1
                    importedByUrl.set(url, {
                        url,
                        title: entry.lastVisitedAt >= existing.lastVisitedAt ? entry.title : existing.title,
                        visitCount: Math.min(Number.MAX_SAFE_INTEGER, existing.visitCount + entry.visitCount),
                        lastVisitedAt: entry.lastVisitedAt >= existing.lastVisitedAt ? entry.lastVisitedAt : existing.lastVisitedAt
                    })
                } else {
                    importedByUrl.set(url, entry)
                }
            }

            const currentByUrl = new Map(this.entries.map((entry) => [entry.url, entry]))
            let added = 0
            let updated = 0
            for (const imported of importedByUrl.values()) {
                const existing = currentByUrl.get(imported.url)
                if (!existing) {
                    currentByUrl.set(imported.url, {
                        url: imported.url,
                        title: imported.title,
                        faviconUrl: null,
                        lastVisitedAt: imported.lastVisitedAt,
                        visitCount: imported.visitCount
                    })
                    added += 1
                    continue
                }
                const next = {
                    ...existing,
                    title: imported.lastVisitedAt > existing.lastVisitedAt ? imported.title : existing.title,
                    lastVisitedAt: imported.lastVisitedAt > existing.lastVisitedAt ? imported.lastVisitedAt : existing.lastVisitedAt,
                    visitCount: Math.max(existing.visitCount, imported.visitCount)
                }
                if (next.title !== existing.title || next.lastVisitedAt !== existing.lastVisitedAt || next.visitCount !== existing.visitCount) {
                    currentByUrl.set(imported.url, next)
                    updated += 1
                }
            }
            const mergedEntries = [...currentByUrl.values()]
                .sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt))
            skipped += Math.max(0, mergedEntries.length - BROWSER_HISTORY_ENTRY_LIMIT)
            this.entries = mergedEntries.slice(0, BROWSER_HISTORY_ENTRY_LIMIT)
            await this.persist()
            return { added, updated, duplicatesMerged, skipped }
        })
    }

    clear(): Promise<void> {
        return this.run(async () => {
            await this.load()
            this.entries = []
            await this.persist()
        })
    }

    private run<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationQueue.then(operation, operation)
        this.operationQueue = result.then(() => undefined, () => undefined)
        return result
    }

    private async load(): Promise<void> {
        if (this.loaded) return
        this.loaded = true
        let parsed: Partial<BrowserHistoryFile>
        try {
            parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<BrowserHistoryFile>
        } catch {
            this.entries = []
            return
        }
        const candidates = Array.isArray(parsed.entries) ? parsed.entries : []
        const byUrl = new Map<string, DevScopeBrowserHistoryEntry>()
        let migrationRequired = parsed.version !== BROWSER_HISTORY_SCHEMA_VERSION
        for (const candidate of candidates) {
            const entry = normalizeStoredEntry(candidate)
            if (!entry) {
                migrationRequired = true
                continue
            }
            if (JSON.stringify(candidate) !== JSON.stringify(entry)) migrationRequired = true
            const existing = byUrl.get(entry.url)
            if (!existing || entry.lastVisitedAt > existing.lastVisitedAt) byUrl.set(entry.url, entry)
            else migrationRequired = true
        }
        this.entries = [...byUrl.values()]
            .sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt))
            .slice(0, BROWSER_HISTORY_ENTRY_LIMIT)
        if (this.entries.length !== candidates.length) migrationRequired = true
        if (migrationRequired) await this.persist()
    }

    private persist(): Promise<void> {
        return writeJsonAtomically(this.filePath, {
            version: BROWSER_HISTORY_SCHEMA_VERSION,
            entries: this.entries
        } satisfies BrowserHistoryFile)
    }
}
