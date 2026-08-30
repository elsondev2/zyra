import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, rm, stat } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DatabaseSync } from 'node:sqlite'

export const BROWSER_THREAT_DATABASE_MAX_BYTES = 50 * 1024 * 1024
export const BROWSER_THREAT_FEED_MAX_COMPRESSED_BYTES = 10 * 1024 * 1024
export const BROWSER_THREAT_FEED_MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024
export const BROWSER_THREAT_FEED_MAX_ENTRIES = 500_000
const BROWSER_THREAT_URL_MAX_LENGTH = 65_536
const BROWSER_THREAT_CSV_ROW_MAX_LENGTH = 131_072

function parseIpv4(hostname) {
    const parts = hostname.split('.')
    if (parts.length !== 4) return null
    const octets = parts.map((part) => Number(part))
    return octets.every((octet, index) => Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === parts[index])
        ? octets
        : null
}

export function isLocalBrowserThreatHostname(value) {
    const hostname = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname) return true
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true
    if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe8') || hostname.startsWith('fe9') || hostname.startsWith('fea') || hostname.startsWith('feb')) {
        return hostname.includes(':')
    }
    const ipv4 = parseIpv4(hostname)
    if (!ipv4) return false
    return ipv4[0] === 10
        || ipv4[0] === 127
        || (ipv4[0] === 169 && ipv4[1] === 254)
        || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
        || (ipv4[0] === 192 && ipv4[1] === 168)
}

export function canonicalizeBrowserThreatUrl(value) {
    const raw = String(value || '').trim()
    if (!raw || raw.length > BROWSER_THREAT_URL_MAX_LENGTH) return null
    try {
        const url = new URL(raw)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        if (isLocalBrowserThreatHostname(url.hostname)) return null
        url.hash = ''
        return url.toString()
    } catch {
        return null
    }
}

export function hashBrowserThreatUrl(value) {
    const canonical = canonicalizeBrowserThreatUrl(value)
    return canonical ? createHash('sha256').update(canonical).digest().subarray(0, 16) : null
}

export function parseBrowserThreatCsvLine(line) {
    const fields = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index]
        if (quoted) {
            if (character === '"' && line[index + 1] === '"') {
                current += '"'
                index += 1
            } else if (character === '"') {
                quoted = false
            } else {
                current += character
            }
            continue
        }
        if (character === '"') quoted = true
        else if (character === ',') {
            fields.push(current)
            current = ''
        } else current += character
    }
    if (quoted) throw new Error('Phishing feed contains an unterminated CSV field.')
    fields.push(current)
    return fields
}

function createByteLimit(maximumBytes) {
    let total = 0
    return new Transform({
        transform(chunk, _encoding, callback) {
            total += chunk.length
            if (total > maximumBytes) {
                callback(new Error('Phishing feed exceeded the decompressed size limit.'))
                return
            }
            callback(null, chunk)
        }
    })
}

export async function buildBrowserThreatDatabaseFromGzip(input) {
    const outputPath = String(input.outputPath || '')
    if (!outputPath) throw new Error('Threat database output path is required.')
    await rm(outputPath, { force: true })

    const database = new DatabaseSync(outputPath)
    let committed = false
    try {
        database.exec(`
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            PRAGMA temp_store = FILE;
            CREATE TABLE threat_urls (url_hash BLOB PRIMARY KEY) WITHOUT ROWID;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            BEGIN IMMEDIATE;
        `)
        const insert = database.prepare('INSERT OR IGNORE INTO threat_urls (url_hash) VALUES (?)')
        const source = typeof input.gzipPath === 'string'
            ? createReadStream(input.gzipPath)
            : input.gzipStream
        if (!source) throw new Error('Threat feed input is required.')
        const decompressed = new PassThrough()
        const decompressionResult = pipeline(
            source,
            createGunzip(),
            createByteLimit(input.maxUncompressedBytes || BROWSER_THREAT_FEED_MAX_UNCOMPRESSED_BYTES),
            decompressed
        ).then(() => ({ error: null }), (error) => ({ error }))
        const lines = createInterface({ input: decompressed, crlfDelay: Infinity })
        let header = null
        let urlIndex = -1
        let entryCount = 0
        let rowCount = 0
        try {
            for await (const rawLine of lines) {
                const line = String(rawLine).replace(/^\uFEFF/u, '')
                if (!line) continue
                if (line.length > BROWSER_THREAT_CSV_ROW_MAX_LENGTH) throw new Error('Phishing feed contains an oversized row.')
                const fields = parseBrowserThreatCsvLine(line)
                if (!header) {
                    header = fields.map((field) => field.trim().toLowerCase())
                    urlIndex = header.indexOf('url')
                    if (urlIndex < 0) throw new Error('Phishing feed is missing its URL column.')
                    continue
                }
                rowCount += 1
                if (rowCount > (input.maxEntries || BROWSER_THREAT_FEED_MAX_ENTRIES)) {
                    throw new Error('Phishing feed exceeded the entry limit.')
                }
                const hash = hashBrowserThreatUrl(fields[urlIndex])
                if (!hash) continue
                const result = insert.run(hash)
                if (Number(result.changes || 0) > 0) entryCount += 1
            }
        } catch (error) {
            decompressed.destroy(error)
            await decompressionResult
            throw error
        }
        const decompression = await decompressionResult
        if (decompression.error) throw decompression.error
        if (!header || entryCount === 0) throw new Error('Phishing feed did not contain usable URLs.')
        const metadata = database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)')
        const updatedAt = String(input.updatedAt || new Date().toISOString())
        metadata.run('source', 'phishtank')
        metadata.run('updated_at', updatedAt)
        metadata.run('entry_count', String(entryCount))
        if (input.etag) metadata.run('etag', String(input.etag))
        if (input.lastModified) metadata.run('last_modified', String(input.lastModified))
        database.exec('COMMIT; PRAGMA optimize;')
        committed = true
        database.close()
        await chmod(outputPath, 0o600).catch(() => undefined)
        const databaseBytes = (await stat(outputPath)).size
        if (databaseBytes > (input.maxDatabaseBytes || BROWSER_THREAT_DATABASE_MAX_BYTES)) {
            throw new Error('Phishing database exceeded the disk budget.')
        }
        return { entryCount, rowCount, databaseBytes, updatedAt }
    } catch (error) {
        if (!committed) {
            try { database.exec('ROLLBACK') } catch {}
            try { database.close() } catch {}
        }
        await rm(outputPath, { force: true }).catch(() => undefined)
        throw error
    }
}
