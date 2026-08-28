import { nativeImage, net, protocol } from 'electron'
import log from 'electron-log'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolveFileMimeType, resolveProtocolFilePath } from './local-file-content'

const CONTENT_SECURITY_POLICY = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
const THUMBNAIL_CACHE_MAX_ENTRIES = 384
const THUMBNAIL_CACHE_MAX_BYTES = 48 * 1024 * 1024
const THUMBNAIL_MAX_EDGE = 512
const THUMBNAIL_CONCURRENCY = 4

type ThumbnailCacheEntry = { data: Buffer; bytes: number }
const thumbnailCache = new Map<string, ThumbnailCacheEntry>()
const thumbnailRequests = new Map<string, Promise<Buffer | null>>()
const thumbnailWaiters: Array<() => void> = []
let thumbnailCacheBytes = 0
let activeThumbnailJobs = 0

type ByteRange = {
    start: number
    end: number
}

function resolveByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (!match || fileSize === 0) return null

    const [, startText, endText] = match
    if (!startText && !endText) return null

    if (!startText) {
        const suffixLength = Number(endText)
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
        return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 }
    }

    const start = Number(startText)
    const requestedEnd = endText ? Number(endText) : fileSize - 1
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(requestedEnd)
        || start < 0
        || requestedEnd < start
        || start >= fileSize
    ) {
        return null
    }

    return { start, end: Math.min(requestedEnd, fileSize - 1) }
}

function isMissingFileError(error: unknown): boolean {
    let current = error
    const visited = new Set<unknown>()

    while (current && typeof current === 'object' && !visited.has(current)) {
        visited.add(current)
        const details = current as { cause?: unknown; code?: unknown; message?: unknown }
        if (details.code === 'ENOENT' || details.code === 'ERR_FILE_NOT_FOUND' || details.code === -6) return true
        if (typeof details.message === 'string' && /(?:ENOENT|ERR_FILE_NOT_FOUND)/.test(details.message)) return true
        current = details.cause
    }

    return false
}

function createResponseHeaders(filePath: string, fileSize: number): Headers {
    return new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'Content-Type': resolveFileMimeType(filePath)
    })
}

function emptyResponse(status: number, headers?: HeadersInit): Response {
    return new Response(null, { status, headers })
}

function parseThumbnailSize(requestUrl: string): { width: number; height: number } | null {
    const value = new URL(requestUrl).searchParams.get('thumbnail') || ''
    const match = /^(\d{2,4})x(\d{2,4})$/.exec(value)
    if (!match) return null
    const width = Math.max(32, Math.min(THUMBNAIL_MAX_EDGE, Number(match[1])))
    const height = Math.max(32, Math.min(THUMBNAIL_MAX_EDGE, Number(match[2])))
    return { width, height }
}

async function acquireThumbnailSlot(): Promise<void> {
    if (activeThumbnailJobs < THUMBNAIL_CONCURRENCY) {
        activeThumbnailJobs += 1
        return
    }
    await new Promise<void>((resolve) => thumbnailWaiters.push(resolve))
    activeThumbnailJobs += 1
}

function releaseThumbnailSlot(): void {
    activeThumbnailJobs = Math.max(0, activeThumbnailJobs - 1)
    thumbnailWaiters.shift()?.()
}

function retainThumbnail(key: string, data: Buffer): void {
    const previous = thumbnailCache.get(key)
    if (previous) thumbnailCacheBytes -= previous.bytes
    thumbnailCache.delete(key)
    thumbnailCache.set(key, { data, bytes: data.byteLength })
    thumbnailCacheBytes += data.byteLength
    while (thumbnailCache.size > THUMBNAIL_CACHE_MAX_ENTRIES || thumbnailCacheBytes > THUMBNAIL_CACHE_MAX_BYTES) {
        const oldestKey = thumbnailCache.keys().next().value
        if (typeof oldestKey !== 'string') break
        const oldest = thumbnailCache.get(oldestKey)
        if (oldest) thumbnailCacheBytes -= oldest.bytes
        thumbnailCache.delete(oldestKey)
    }
}

async function createThumbnail(filePath: string, width: number, height: number): Promise<Buffer | null> {
    await acquireThumbnailSlot()
    try {
        let image = await nativeImage.createThumbnailFromPath(filePath, { width, height }).catch(() => nativeImage.createEmpty())
        if (image.isEmpty()) {
            const source = nativeImage.createFromPath(filePath)
            if (source.isEmpty()) return null
            const sourceSize = source.getSize()
            const scale = Math.min(width / Math.max(1, sourceSize.width), height / Math.max(1, sourceSize.height), 1)
            image = source.resize({
                width: Math.max(1, Math.round(sourceSize.width * scale)),
                height: Math.max(1, Math.round(sourceSize.height * scale)),
                quality: 'good'
            })
        }
        return image.isEmpty() ? null : image.toPNG()
    } finally {
        releaseThumbnailSlot()
    }
}

function getThumbnail(filePath: string, width: number, height: number, size: number, modifiedAt: number): Promise<Buffer | null> {
    const key = `${filePath}\u0000${size}\u0000${modifiedAt}\u0000${width}x${height}`
    const cached = thumbnailCache.get(key)
    if (cached) {
        thumbnailCache.delete(key)
        thumbnailCache.set(key, cached)
        return Promise.resolve(cached.data)
    }
    const pending = thumbnailRequests.get(key)
    if (pending) return pending
    const request = createThumbnail(filePath, width, height).then((data) => {
        if (data) retainThumbnail(key, data)
        return data
    }).finally(() => thumbnailRequests.delete(key))
    thumbnailRequests.set(key, request)
    return request
}

export function registerFileProtocol(fileProtocol: string) {
    protocol.handle(fileProtocol, async (request) => {
        let filePath = ''

        try {
            filePath = resolveProtocolFilePath(request.url)
        } catch (error) {
            log.error('Failed to resolve protocol URL:', request.url, error)
            return emptyResponse(500)
        }

        // Electron's file loader streams range bodies but omits 206 and range metadata,
        // so read only file metadata here and normalize the response below.
        let fileSize = 0
        let modifiedAt = 0
        try {
            const fileStats = await stat(filePath)
            fileSize = fileStats.size
            modifiedAt = fileStats.mtimeMs
        } catch (error) {
            if (!isMissingFileError(error)) {
                log.error('Failed to read local protocol file:', filePath, error)
            }
            return emptyResponse(404)
        }

        const thumbnailSize = parseThumbnailSize(request.url)
        if (thumbnailSize && resolveFileMimeType(filePath).startsWith('image/') && (request.method === 'GET' || request.method === 'HEAD')) {
            const thumbnail = await getThumbnail(filePath, thumbnailSize.width, thumbnailSize.height, fileSize, modifiedAt)
            if (thumbnail) {
                const headers = new Headers({
                    'Cache-Control': 'no-store',
                    'Content-Length': String(thumbnail.byteLength),
                    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
                    'Content-Type': 'image/png'
                })
                const body = new Uint8Array(thumbnail.byteLength)
                body.set(thumbnail)
                return request.method === 'HEAD' ? emptyResponse(200, headers) : new Response(body.buffer, { status: 200, headers })
            }
        }

        const rangeHeader = request.method === 'GET' ? request.headers.get('range') : null
        const byteRange = rangeHeader ? resolveByteRange(rangeHeader, fileSize) : undefined
        if (rangeHeader && !byteRange) {
            const headers = createResponseHeaders(filePath, 0)
            headers.set('Content-Range', `bytes */${fileSize}`)
            return emptyResponse(416, headers)
        }

        try {
            const fileResponse = await net.fetch(pathToFileURL(filePath).href, {
                method: request.method,
                headers: request.headers
            })
            const headers = new Headers(fileResponse.headers)
            headers.set('Accept-Ranges', 'bytes')
            headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
            headers.set('Content-Type', resolveFileMimeType(filePath))

            if (byteRange) {
                headers.set('Content-Length', String(byteRange.end - byteRange.start + 1))
                headers.set('Content-Range', `bytes ${byteRange.start}-${byteRange.end}/${fileSize}`)
            } else {
                headers.set('Content-Length', String(fileSize))
            }

            return new Response(fileResponse.body, {
                status: byteRange ? 206 : fileResponse.status,
                statusText: byteRange ? 'Partial Content' : fileResponse.statusText,
                headers
            })
        } catch (error) {
            if (!isMissingFileError(error)) {
                log.error('Failed to read local protocol file:', filePath, error)
            }
            return emptyResponse(404)
        }
    })
}
