import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DevScopeBrowserBookmark } from '../shared/contracts/devscope-api'
import { isAuthenticationBrowserUrl, sanitizeBrowserPersistentUrl } from '../shared/browser-url-sanitization'
import { writeJsonAtomically } from './setup/atomic-json'

const BOOKMARK_LIMIT = 1_000

function normalizeBookmark(value: unknown): DevScopeBrowserBookmark | null {
    if (!value || typeof value !== 'object') return null
    const input = value as Partial<DevScopeBrowserBookmark>
    const rawUrl = String(input.url || '')
    const url = sanitizeBrowserPersistentUrl(rawUrl, 2_048)
    if (!url) return null
    const title = isAuthenticationBrowserUrl(rawUrl)
        ? new URL(url).hostname
        : String(input.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() || new URL(url).hostname
    const rawFavicon = String(input.faviconUrl || '').trim()
    const faviconUrl = rawFavicon.length <= 8_192 && /^data:image\/(?:png|gif|jpe?g|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(rawFavicon)
        ? rawFavicon
        : sanitizeBrowserPersistentUrl(rawFavicon, 8_192)
    const timestamp = Date.parse(String(input.savedAt || ''))
    return {
        url,
        title: title.slice(0, 256),
        faviconUrl,
        savedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
    }
}

export function getBrowserBookmarksFilePath(userDataPath: string): string {
    return join(userDataPath, 'browser-preview', 'bookmarks-v1.json')
}

export class BrowserBookmarksStore {
    private loaded = false
    private entries: DevScopeBrowserBookmark[] = []
    private operationQueue: Promise<void> = Promise.resolve()

    constructor(private readonly filePath: string) {}

    list(): Promise<DevScopeBrowserBookmark[]> {
        return this.run(async () => {
            await this.load()
            return this.entries.map((entry) => ({ ...entry }))
        })
    }

    save(input: { url: string; title?: string | null; faviconUrl?: string | null }): Promise<DevScopeBrowserBookmark | null> {
        return this.run(async () => {
            await this.load()
            const entry = normalizeBookmark({ ...input, savedAt: new Date().toISOString() })
            if (!entry) return null
            this.entries = [entry, ...this.entries.filter((item) => item.url !== entry.url)].slice(0, BOOKMARK_LIMIT)
            await this.persist()
            return { ...entry }
        })
    }

    remove(url: string): Promise<boolean> {
        return this.run(async () => {
            await this.load()
            const normalized = sanitizeBrowserPersistentUrl(url, 2_048)
            if (!normalized) return false
            const next = this.entries.filter((entry) => entry.url !== normalized)
            if (next.length === this.entries.length) return false
            this.entries = next
            await this.persist()
            return true
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
        try {
            const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as { entries?: unknown[] }
            const byUrl = new Map<string, DevScopeBrowserBookmark>()
            for (const candidate of Array.isArray(parsed.entries) ? parsed.entries : []) {
                const entry = normalizeBookmark(candidate)
                if (entry && !byUrl.has(entry.url)) byUrl.set(entry.url, entry)
            }
            this.entries = [...byUrl.values()].slice(0, BOOKMARK_LIMIT)
        } catch {
            this.entries = []
        }
    }

    private persist(): Promise<void> {
        return writeJsonAtomically(this.filePath, { version: 1, entries: this.entries })
    }
}
