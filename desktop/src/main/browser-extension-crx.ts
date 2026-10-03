import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import yauzl from 'yauzl'

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const MAX_FILES = 10_000
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024

function readUInt32LE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16) | ((bytes[offset + 3] || 0) << 24 >>> 0)
}

function extensionIdFromPublicKey(publicKey: Uint8Array): string {
    const digest = createHash('sha256').update(publicKey).digest()
    return [...digest.subarray(0, 16)].map(byte => `${byte >> 4}${byte & 15}`).join('').replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + Number.parseInt(digit, 16)))
}

function readVarint(bytes: Uint8Array, state: { offset: number }): number {
    let value = 0
    let shift = 0
    while (state.offset < bytes.length && shift < 35) {
        const byte = bytes[state.offset++]
        value += (byte & 0x7f) * 2 ** shift
        if ((byte & 0x80) === 0) return value
        shift += 7
    }
    throw new Error('The CRX3 header contains an invalid protobuf.')
}

function crx3PublicKey(header: Uint8Array): Uint8Array | null {
    const keys: Uint8Array[] = []
    const state = { offset: 0 }
    while (state.offset < header.length) {
        const tag = readVarint(header, state)
        const length = readVarint(header, state)
        const end = state.offset + length
        if (end > header.length) throw new Error('The CRX3 header is truncated.')
        if (tag === 0x12) {
            const proof = header.subarray(state.offset, end)
            const proofState = { offset: 0 }
            while (proofState.offset < proof.length) {
                const proofTag = readVarint(proof, proofState)
                const proofLength = readVarint(proof, proofState)
                const proofEnd = proofState.offset + proofLength
                if (proofEnd > proof.length) throw new Error('The CRX3 proof is truncated.')
                if (proofTag === 0x0a) keys.push(proof.slice(proofState.offset, proofEnd))
                proofState.offset = proofEnd
            }
        }
        state.offset = end
    }
    return keys[0] || null
}

export function unpackedZipOffset(crx: Uint8Array): { offset: number; publicKey: Uint8Array | null } {
    if (crx.length >= 4 && crx[0] === 0x50 && crx[1] === 0x4b && crx[2] === 0x03 && crx[3] === 0x04) return { offset: 0, publicKey: null }
    if (crx.length < 12 || crx[0] !== 0x43 || crx[1] !== 0x72 || crx[2] !== 0x32 || crx[3] !== 0x34) throw new Error('The download is not a CRX or ZIP extension package.')
    const version = readUInt32LE(crx, 4)
    if (version === 2) {
        if (crx.length < 16) throw new Error('The CRX2 header is truncated.')
        const publicKeyLength = readUInt32LE(crx, 8)
        const signatureLength = readUInt32LE(crx, 12)
        const offset = 16 + publicKeyLength + signatureLength
        if (offset > crx.length) throw new Error('The CRX2 package is truncated.')
        return { offset, publicKey: crx.slice(16, 16 + publicKeyLength) }
    }
    if (version === 3) {
        const headerLength = readUInt32LE(crx, 8)
        const offset = 12 + headerLength
        if (offset > crx.length) throw new Error('The CRX3 package is truncated.')
        return { offset, publicKey: crx3PublicKey(crx.subarray(12, offset)) }
    }
    throw new Error(`Unsupported CRX version ${version}.`)
}

export async function downloadChromeWebStoreCrx(extensionId: string): Promise<{ bytes: Buffer; sha256: string }> {
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc&prodversion=${process.versions.chrome}`
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Chrome Web Store returned HTTP ${response.status}.`)
    const advertisedLength = Number(response.headers.get('content-length') || 0)
    if (advertisedLength > MAX_DOWNLOAD_BYTES) throw new Error('The extension package is too large.')
    if (!response.body) throw new Error('Chrome Web Store returned an empty response.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const next = await reader.read()
        if (next.done) break
        total += next.value.byteLength
        if (total > MAX_DOWNLOAD_BYTES) throw new Error('The extension package is too large.')
        chunks.push(next.value)
    }
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    return { bytes, sha256 }
}

export async function extractCrxToDirectory(bytes: Buffer, destination: string, expectedId: string): Promise<{ sha256: string }> {
    const { offset, publicKey } = unpackedZipOffset(bytes)
    if (publicKey && extensionIdFromPublicKey(publicKey) !== expectedId) throw new Error('The package identity does not match the requested Chrome Web Store extension.')
    const zipBytes = bytes.subarray(offset)
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    await new Promise<void>((resolvePromise, reject) => {
        yauzl.fromBuffer(zipBytes, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
            if (error || !zipFile) return reject(error || new Error('The extension ZIP could not be opened.'))
            let files = 0
            let unpackedBytes = 0
            let settled = false
            const fail = (failure: Error) => {
                if (settled) return
                settled = true
                zipFile.close()
                reject(failure)
            }
            zipFile.on('error', fail)
            zipFile.on('end', () => {
                if (!settled) { settled = true; resolvePromise() }
            })
            zipFile.on('entry', entry => {
                if (settled) return
                files += 1
                if (files > MAX_FILES) return fail(new Error('The extension contains too many files.'))
                const normalized = entry.fileName.replace(/\\/g, '/')
                const target = resolve(destination, normalized)
                if (target !== destination && !target.startsWith(`${resolve(destination)}${sep}`)) return fail(new Error('The extension contains an unsafe file path.'))
                if (normalized.endsWith('/')) {
                    void mkdir(target, { recursive: true }).then(() => zipFile.readEntry()).catch(fail)
                    return
                }
                unpackedBytes += entry.uncompressedSize
                if (unpackedBytes > MAX_UNPACKED_BYTES) return fail(new Error('The unpacked extension is too large.'))
                void mkdir(dirname(target), { recursive: true }).then(() => {
                    zipFile.openReadStream(entry, (streamError, stream) => {
                        if (streamError || !stream) return fail(streamError || new Error('The extension file could not be read.'))
                        const output = createWriteStream(target, { flags: 'wx' })
                        stream.on('error', fail)
                        output.on('error', fail)
                        output.on('close', () => zipFile.readEntry())
                        stream.pipe(output)
                    })
                }).catch(fail)
            })
            zipFile.readEntry()
        })
    })
    try {
        const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')) as { manifest_version?: number }
        if (manifest.manifest_version !== 3) throw new Error('Only Manifest V3 extensions are supported in Zyra Browser.')
        await stat(join(destination, 'manifest.json'))
    } catch (error) {
        await rm(destination, { recursive: true, force: true })
        throw error instanceof Error ? error : new Error('The extension manifest is invalid.')
    }
    return { sha256: createHash('sha256').update(bytes).digest('hex') }
}
