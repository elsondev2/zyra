import { open as fsOpen } from 'node:fs/promises'

export const BINARY_PREVIEW_MAX_BYTES = 128 * 1024 * 1024

export async function readBinaryPreviewFile(filePath: string) {
    const fileHandle = await fsOpen(filePath, 'r')
    try {
        const fileStats = await fileHandle.stat()
        if (!fileStats.isFile()) return { success: false as const, error: 'The selected path is not a file.' }
        if (fileStats.size > BINARY_PREVIEW_MAX_BYTES) {
            return {
                success: false as const,
                error: `Embedded binary previews are limited to ${BINARY_PREVIEW_MAX_BYTES / (1024 * 1024)} MB.`,
                size: fileStats.size
            }
        }
        const bytes = await fileHandle.readFile()
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        return {
            success: true as const,
            data,
            size: fileStats.size,
            modifiedAt: fileStats.mtimeMs
        }
    } finally {
        await fileHandle.close().catch(() => undefined)
    }
}
