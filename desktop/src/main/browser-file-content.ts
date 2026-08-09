import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveFileMimeType, resolveProtocolFilePath } from './local-file-content'

type BrowserFileRange = { start: number; end: number }

function parseBrowserFileRange(value: string, size: number): BrowserFileRange | null | false {
    const raw = value.trim()
    if (!raw) return null
    const match = raw.match(/^bytes=(\d*)-(\d*)$/i)
    if (!match || size <= 0) return false
    const startText = match[1]
    const endText = match[2]
    if (!startText && !endText) return false

    if (!startText) {
        const suffixLength = Number(endText)
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false
        return { start: Math.max(0, size - suffixLength), end: size - 1 }
    }

    const start = Number(startText)
    const requestedEnd = endText ? Number(endText) : size - 1
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(requestedEnd)
        || start < 0
        || requestedEnd < start
        || start >= size
    ) return false
    return { start, end: Math.min(requestedEnd, size - 1) }
}

function writeFileError(response: ServerResponse, statusCode: number, error: string): void {
    if (response.headersSent) {
        response.end()
        return
    }
    response.statusCode = statusCode
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ ok: false, error }))
}

export async function serveBrowserFileContent(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL
): Promise<void> {
    const rawSource = String(requestUrl.searchParams.get('source') || '')
    if (!rawSource || rawSource.length > 16_384) {
        writeFileError(response, 400, 'Browser file source is invalid.')
        return
    }
    const source = rawSource.startsWith('devscope://')
        ? `zyra://${rawSource.slice('devscope://'.length)}`
        : rawSource
    if (!source.startsWith('zyra://')) {
        writeFileError(response, 400, 'Browser file source is invalid.')
        return
    }

    let filePath: string
    try {
        filePath = resolveProtocolFilePath(source)
    } catch {
        writeFileError(response, 400, 'Browser file source is invalid.')
        return
    }
    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat?.isFile()) {
        writeFileError(response, 404, 'Browser file was not found.')
        return
    }

    const range = parseBrowserFileRange(String(request.headers.range || ''), fileStat.size)
    if (range === false) {
        response.statusCode = 416
        response.setHeader('Content-Range', `bytes */${fileStat.size}`)
        response.end()
        return
    }
    const start = range?.start ?? 0
    const end = range?.end ?? Math.max(0, fileStat.size - 1)
    const contentLength = fileStat.size === 0 ? 0 : end - start + 1
    response.statusCode = range ? 206 : 200
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Content-Length', String(contentLength))
    response.setHeader('Content-Type', resolveFileMimeType(filePath))
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
    if (request.method === 'HEAD' || fileStat.size === 0) {
        response.end()
        return
    }

    await new Promise<void>((resolveStream) => {
        const stream = createReadStream(filePath, { start, end })
        stream.on('error', () => {
            if (!response.headersSent) writeFileError(response, 500, 'Browser file could not be read.')
            else response.end()
            resolveStream()
        })
        stream.on('end', resolveStream)
        response.on('close', () => {
            stream.destroy()
            resolveStream()
        })
        stream.pipe(response)
    })
}
