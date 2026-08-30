import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
    DevScopeBrowserBackgroundCategory,
    DevScopeBrowserBackgroundProviderStatus,
    DevScopeBrowserRemoteBackground
} from '../shared/contracts/devscope-api'
import type { DeviceSecretsService } from './setup/device-secrets-service'
import { writeJsonAtomically } from './setup/atomic-json'

const CACHE_VERSION = 1
const CACHE_LIMIT = 90
const CATEGORY_LIMIT = 12
const FETCH_TIMEOUT_MS = 12_000
const UNSPLASH_API_ORIGIN = 'https://api.unsplash.com'
const UNSPLASH_WEB_ORIGINS = new Set(['https://unsplash.com', 'https://www.unsplash.com'])

const CATEGORY_QUERIES: Record<DevScopeBrowserBackgroundCategory, string> = {
    all: 'nature landscape outdoors',
    'forest-paths': 'forest trail woodland',
    'mountain-highs': 'mountains alpine landscape',
    'ocean-moods': 'ocean coast sea',
    'desert-dreams': 'desert dunes landscape',
    'water-in-motion': 'waterfall river nature',
    'wildflower-party': 'wildflower meadow flowers',
    'animal-cameos': 'wildlife animal nature',
    'ice-aurora': 'aurora glacier ice',
    'earth-above': 'earth aerial landscape'
}

type CacheFile = {
    version: 1
    entries: DevScopeBrowserRemoteBackground[]
}

function safeUnsplashUrl(value: unknown, origins: readonly string[]): string | null {
    try {
        const url = new URL(String(value || ''))
        if (url.protocol !== 'https:' || !origins.includes(url.origin)) return null
        return url.toString().slice(0, 8_192)
    } catch {
        return null
    }
}

function withReferral(value: string): string {
    const url = new URL(value)
    url.searchParams.set('utm_source', 'zyra')
    url.searchParams.set('utm_medium', 'referral')
    return url.toString()
}

function imageVariant(value: string, width: number, height: number, quality: number): string {
    const url = new URL(value)
    url.searchParams.set('fit', 'crop')
    url.searchParams.set('crop', 'entropy')
    url.searchParams.set('w', String(width))
    url.searchParams.set('h', String(height))
    url.searchParams.set('q', String(quality))
    url.searchParams.set('fm', 'webp')
    return url.toString()
}

function normalizePhoto(value: unknown, category: DevScopeBrowserBackgroundCategory): DevScopeBrowserRemoteBackground | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const photo = value as Record<string, any>
    const id = String(photo.id || '').trim().slice(0, 128)
    const rawImageUrl = safeUnsplashUrl(photo.urls?.raw || photo.urls?.full || photo.urls?.regular, ['https://images.unsplash.com'])
    const photographerUrl = safeUnsplashUrl(photo.user?.links?.html, ['https://unsplash.com'])
    const photoUrl = safeUnsplashUrl(photo.links?.html, ['https://unsplash.com'])
    const downloadLocation = safeUnsplashUrl(photo.links?.download_location, [UNSPLASH_API_ORIGIN])
    const photographer = String(photo.user?.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    if (!id || !rawImageUrl || !photographerUrl || !photoUrl || !downloadLocation || !photographer) return null
    return {
        id,
        provider: 'unsplash',
        category,
        imageUrl: imageVariant(rawImageUrl, 1920, 1280, 80),
        thumbnailUrl: imageVariant(rawImageUrl, 480, 320, 74),
        color: /^#[0-9a-f]{6}$/i.test(String(photo.color || '')) ? String(photo.color) : null,
        alt: String(photo.alt_description || photo.description || 'Nature background').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320),
        photographer,
        photographerUrl: withReferral(photographerUrl),
        photoUrl: withReferral(photoUrl),
        downloadLocation
    }
}

function isCategory(value: unknown): value is DevScopeBrowserBackgroundCategory {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_QUERIES, value)
}

function sanitizeSearchQuery(value: unknown): string {
    const query = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    const isUrl = /^https?:\/\//i.test(query)
    if ((!isUrl && query.length > 160) || query.length > 2_048) throw new Error('Keep Unsplash searches under 160 characters.')
    return query
}

function photoIdFromUnsplashUrl(value: string): string | null {
    if (!/^https?:\/\//i.test(value)) return null
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new Error('Enter search words or a valid Unsplash photo link.')
    }
    if (url.protocol !== 'https:' || !UNSPLASH_WEB_ORIGINS.has(url.origin)) {
        throw new Error('Only Unsplash photo links can be used here.')
    }
    const segments = url.pathname.split('/').filter(Boolean)
    const photosIndex = segments.indexOf('photos')
    const photoSlug = photosIndex >= 0 ? segments[photosIndex + 1] : ''
    const match = photoSlug?.match(/([A-Za-z0-9_-]{11})$/)
    if (!match) throw new Error('That Unsplash link does not identify a photo.')
    return match[1]!
}

export class BrowserBackgroundService {
    private loaded = false
    private entries: DevScopeBrowserRemoteBackground[] = []
    private operationQueue: Promise<void> = Promise.resolve()

    constructor(
        private readonly secrets: DeviceSecretsService,
        private readonly cachePath: string
    ) {}

    async status(): Promise<DevScopeBrowserBackgroundProviderStatus> {
        return {
            unsplashConfigured: Boolean(await this.secrets.getUnsplashAccessKey()),
            persistenceAvailable: this.secrets.isPersistenceAvailable()
        }
    }

    async validateAccessKey(value: string): Promise<void> {
        const accessKey = String(value || '').trim()
        if (!accessKey || accessKey.length > 4_096 || /[\u0000-\u0020\u007f]/.test(accessKey)) throw new Error('Enter a valid Unsplash Access Key.')
        const backgrounds = await this.fetch('all', accessKey, 1)
        if (backgrounds.length === 0) throw new Error('The Unsplash access key returned no usable photos.')
    }

    list(input: { category: DevScopeBrowserBackgroundCategory; refresh?: boolean; query?: string }): Promise<DevScopeBrowserRemoteBackground[]> {
        return this.enqueue(async () => {
            await this.load()
            const category = isCategory(input?.category) ? input.category : 'all'
            const accessKey = await this.secrets.getUnsplashAccessKey()
            const query = sanitizeSearchQuery(input?.query)
            if (query) {
                if (!accessKey) throw new Error('Add an Unsplash access key before searching photos.')
                const next = await this.search(category, accessKey, query)
                this.merge(next)
                await this.persist()
                return next.map((entry) => ({ ...entry }))
            }
            let available = this.forCategory(category)
            if (accessKey && (input?.refresh === true || available.length < 6)) {
                const next = await this.fetch(category, accessKey)
                this.merge(next)
                await this.persist()
                available = this.forCategory(category)
            }
            return available.map((entry) => ({ ...entry }))
        })
    }

    async track(downloadLocation: string): Promise<void> {
        const accessKey = await this.secrets.getUnsplashAccessKey()
        if (!accessKey) throw new Error('Add an Unsplash access key before using live backgrounds.')
        const url = safeUnsplashUrl(downloadLocation, [UNSPLASH_API_ORIGIN])
        if (!url) throw new Error('The Unsplash tracking URL is invalid.')
        const response = await this.fetchWithTimeout(url, {
            headers: { Authorization: `Client-ID ${accessKey}` }
        })
        if (!response.ok) throw new Error('Unsplash could not record the selected background.')
    }

    private forCategory(category: DevScopeBrowserBackgroundCategory): DevScopeBrowserRemoteBackground[] {
        const candidates = category === 'all' ? this.entries : this.entries.filter((entry) => entry.category === category)
        return candidates.slice(0, CATEGORY_LIMIT)
    }

    private async fetch(category: DevScopeBrowserBackgroundCategory, accessKey: string, count = 12): Promise<DevScopeBrowserRemoteBackground[]> {
        const endpoint = new URL('/photos/random', UNSPLASH_API_ORIGIN)
        endpoint.searchParams.set('orientation', 'landscape')
        endpoint.searchParams.set('content_filter', 'high')
        endpoint.searchParams.set('count', String(Math.max(1, Math.min(12, count))))
        endpoint.searchParams.set('query', CATEGORY_QUERIES[category])
        const response = await this.fetchWithTimeout(endpoint.toString(), {
            headers: {
                Accept: 'application/json',
                'Accept-Version': 'v1',
                Authorization: `Client-ID ${accessKey}`
            }
        })
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'The Unsplash access key was rejected.' : 'Unsplash backgrounds are unavailable right now.')
        const payload = await response.json() as unknown
        const photos = Array.isArray(payload) ? payload : [payload]
        return photos.map((photo) => normalizePhoto(photo, category)).filter((photo): photo is DevScopeBrowserRemoteBackground => Boolean(photo))
    }

    private async search(category: DevScopeBrowserBackgroundCategory, accessKey: string, query: string): Promise<DevScopeBrowserRemoteBackground[]> {
        const photoId = photoIdFromUnsplashUrl(query)
        const endpoint = photoId
            ? new URL(`/photos/${encodeURIComponent(photoId)}`, UNSPLASH_API_ORIGIN)
            : new URL('/search/photos', UNSPLASH_API_ORIGIN)
        if (!photoId) {
            endpoint.searchParams.set('query', query)
            endpoint.searchParams.set('page', '1')
            endpoint.searchParams.set('per_page', String(CATEGORY_LIMIT))
            endpoint.searchParams.set('orientation', 'landscape')
            endpoint.searchParams.set('content_filter', 'high')
        }
        const response = await this.fetchWithTimeout(endpoint.toString(), {
            headers: {
                Accept: 'application/json',
                'Accept-Version': 'v1',
                Authorization: `Client-ID ${accessKey}`
            }
        })
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error('The Unsplash access key was rejected.')
            if (response.status === 404 && photoId) throw new Error('That Unsplash photo could not be found.')
            throw new Error('Unsplash search is unavailable right now.')
        }
        const payload = await response.json() as any
        const photos = photoId ? [payload] : Array.isArray(payload?.results) ? payload.results : []
        const results = photos.map((photo: unknown) => normalizePhoto(photo, category)).filter((photo: DevScopeBrowserRemoteBackground | null): photo is DevScopeBrowserRemoteBackground => Boolean(photo))
        if (results.length === 0) throw new Error(photoId ? 'That Unsplash photo cannot be used as a background.' : 'No Unsplash photos matched that search.')
        return results
    }

    private fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        timer.unref?.()
        return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
    }

    private merge(next: DevScopeBrowserRemoteBackground[]): void {
        const byId = new Map(this.entries.map((entry) => [entry.id, entry]))
        for (const entry of next) byId.set(entry.id, entry)
        this.entries = [...next, ...[...byId.values()].filter((entry) => !next.some((candidate) => candidate.id === entry.id))].slice(0, CACHE_LIMIT)
    }

    private async load(): Promise<void> {
        if (this.loaded) return
        this.loaded = true
        try {
            const parsed = JSON.parse(await readFile(this.cachePath, 'utf8')) as Partial<CacheFile>
            if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) return
            this.entries = parsed.entries.flatMap((entry) => {
                if (!entry || entry.provider !== 'unsplash' || !isCategory(entry.category)) return []
                const normalized = normalizePhoto({
                    id: entry.id,
                    urls: { raw: entry.imageUrl },
                    color: entry.color,
                    alt_description: entry.alt,
                    user: { name: entry.photographer, links: { html: entry.photographerUrl } },
                    links: { html: entry.photoUrl, download_location: entry.downloadLocation }
                }, entry.category)
                return normalized ? [normalized] : []
            }).slice(0, CACHE_LIMIT)
        } catch {
            this.entries = []
        }
    }

    private persist(): Promise<void> {
        return writeJsonAtomically(this.cachePath, {
            version: CACHE_VERSION,
            entries: this.entries
        } satisfies CacheFile)
    }

    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const next = this.operationQueue.then(work)
        this.operationQueue = next.then(() => undefined, () => undefined)
        return next
    }
}

let configuredService: BrowserBackgroundService | null = null

export function configureBrowserBackgroundService(secrets: DeviceSecretsService, userDataPath: string): BrowserBackgroundService {
    if (!configuredService) configuredService = new BrowserBackgroundService(secrets, join(userDataPath, 'browser-preview', 'unsplash-background-cache-v1.json'))
    return configuredService
}

export function getBrowserBackgroundService(): BrowserBackgroundService | null {
    return configuredService
}
