import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const MAX_CANONICAL_IMAGE_BYTES = 64 * 1024 * 1024

export type CanonicalImagePart = {
    data?: unknown
    mimeType?: unknown
    mime_type?: unknown
}

export function materializeCanonicalImage(
    canonicalChatId: string,
    messageId: string,
    partIndex: number,
    part: CanonicalImagePart
): { path: string; mime: string; size: number } | null {
    const mime = normalizeImageMime(part.mimeType || part.mime_type)
    const bytes = decodeImageData(part.data, mime)
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_CANONICAL_IMAGE_BYTES) return null
    const chatKey = createHash('sha256').update(canonicalChatId).digest('hex').slice(0, 24)
    const messageKey = createHash('sha256').update(messageId).digest('hex').slice(0, 24)
    const directory = join(app.getPath('userData'), 'assistant', 'canonical-media', chatKey)
    mkdirSync(directory, { recursive: true })
    const filePath = join(directory, `${messageKey}-${Math.max(0, partIndex)}${extensionForMime(mime)}`)
    if (!existsSync(filePath)) writeFileSync(filePath, bytes, { mode: 0o600 })
    return { path: filePath, mime, size: bytes.byteLength }
}

function decodeImageData(value: unknown, expectedMime: string): Buffer | null {
    const raw = String(value || '').trim()
    if (!raw) return null
    const dataUrl = raw.match(/^data:([^;,]+);base64,(.+)$/s)
    if (dataUrl && normalizeImageMime(dataUrl[1]) !== expectedMime) return null
    const encoded = dataUrl?.[2] || raw
    if (!/^[a-z0-9+/=\r\n]+$/i.test(encoded)) return null
    try {
        const bytes = Buffer.from(encoded, 'base64')
        return bytes.byteLength > 0 ? bytes : null
    } catch {
        return null
    }
}

function normalizeImageMime(value: unknown): string {
    const mime = String(value || '').trim().toLowerCase()
    return mime.startsWith('image/') ? mime : 'image/png'
}

function extensionForMime(mime: string): string {
    if (mime === 'image/jpeg') return '.jpg'
    if (mime === 'image/gif') return '.gif'
    if (mime === 'image/webp') return '.webp'
    if (mime === 'image/bmp') return '.bmp'
    const extension = extname(`file.${mime.split('/')[1] || ''}`)
    return /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension : '.png'
}
