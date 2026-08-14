import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
    await writeBytesAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writeBytesAtomically(filePath: string, contents: Uint8Array | string): Promise<void> {
    const directory = dirname(filePath)
    await mkdir(directory, { recursive: true })
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
    let handle: Awaited<ReturnType<typeof open>> | null = null
    try {
        handle = await open(temporaryPath, 'wx', 0o600)
        if (typeof contents === 'string') await handle.writeFile(contents, { encoding: 'utf8' })
        else await handle.writeFile(contents)
        await handle.sync()
        await handle.close()
        handle = null
        await rename(temporaryPath, filePath)
        const directoryHandle = await open(directory, 'r').catch(() => null)
        if (directoryHandle) {
            try {
                await directoryHandle.sync().catch((error: NodeJS.ErrnoException) => {
                    // Windows does not support fsync on directory handles. The file itself
                    // has already been flushed, closed, and atomically renamed above.
                    if (process.platform !== 'win32' || (error.code !== 'EPERM' && error.code !== 'EINVAL')) throw error
                })
            } finally {
                await directoryHandle.close()
            }
        }
    } catch (error) {
        if (handle) await handle.close().catch(() => undefined)
        await rm(temporaryPath, { force: true }).catch(() => undefined)
        throw error
    }
}

export class RevisionConflictError extends Error {
    readonly code = 'REVISION_CONFLICT'

    constructor(expectedRevision: number, actualRevision: number) {
        super(`The saved state changed (expected revision ${expectedRevision}, found ${actualRevision}). Refresh and try again.`)
        this.name = 'RevisionConflictError'
    }
}

export class FutureSchemaError extends Error {
    readonly code = 'FUTURE_SCHEMA'

    constructor(readonly detectedVersion: number) {
        super(`This data was created by a newer Zyra version (schema ${detectedVersion}). Update Zyra before continuing.`)
        this.name = 'FutureSchemaError'
    }
}
