import { parentPort, workerData } from 'node:worker_threads'
import { Readable, Transform } from 'node:stream'
import {
    BROWSER_THREAT_DATABASE_MAX_BYTES,
    BROWSER_THREAT_FEED_MAX_COMPRESSED_BYTES,
    BROWSER_THREAT_FEED_MAX_ENTRIES,
    BROWSER_THREAT_FEED_MAX_UNCOMPRESSED_BYTES,
    buildBrowserThreatDatabaseFromGzip
} from './browser-threat-feed-core.mjs'

const PHISHTANK_FEED = 'https://data.phishtank.com/data/online-valid.csv.gz'
const PHISHTANK_FEED_HOSTS = new Set(['data.phishtank.com', 'cdn.phishtank.com'])

function validateFeedUrl(value, allowTestSource) {
    const url = new URL(String(value || PHISHTANK_FEED))
    if (allowTestSource) return url.toString()
    if (url.toString() !== PHISHTANK_FEED) throw new Error('Untrusted phishing feed URL.')
    return url.toString()
}

async function fetchFeed(feedUrl, options, allowTestSource) {
    if (allowTestSource) return fetch(feedUrl, { ...options, redirect: 'follow' })
    let currentUrl = feedUrl
    for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
        const response = await fetch(currentUrl, { ...options, redirect: 'manual' })
        if (![301, 302, 303, 307, 308].includes(response.status)) return response
        const location = response.headers.get('location')
        if (!location) throw new Error('Phishing feed returned an invalid redirect.')
        const nextUrl = new URL(location, currentUrl)
        if (nextUrl.protocol !== 'https:' || !PHISHTANK_FEED_HOSTS.has(nextUrl.hostname)) {
            throw new Error('Phishing feed redirected to an untrusted host.')
        }
        await response.body?.cancel().catch(() => undefined)
        currentUrl = nextUrl.toString()
    }
    throw new Error('Phishing feed returned too many redirects.')
}

async function run() {
    const feedUrl = validateFeedUrl(workerData?.feedUrl, workerData?.allowTestSource === true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    timeout.unref?.()
    try {
        const headers = {
            Accept: 'application/gzip, application/octet-stream;q=0.9',
            'User-Agent': String(workerData?.userAgent || 'Zyra phishing protection')
        }
        if (workerData?.etag) headers['If-None-Match'] = String(workerData.etag)
        const response = await fetchFeed(feedUrl, {
            headers,
            signal: controller.signal
        }, workerData?.allowTestSource === true)
        if (response.status === 304) return { notModified: true }
        if (!response.ok || !response.body) throw new Error(`Phishing feed returned HTTP ${response.status}.`)
        const contentLength = Number(response.headers.get('content-length') || 0)
        if (contentLength > BROWSER_THREAT_FEED_MAX_COMPRESSED_BYTES) {
            throw new Error('Phishing feed exceeded the download budget.')
        }
        let compressedBytes = 0
        const compressedLimit = new Transform({
            transform(chunk, _encoding, callback) {
                compressedBytes += chunk.length
                if (compressedBytes > BROWSER_THREAT_FEED_MAX_COMPRESSED_BYTES) {
                    controller.abort()
                    callback(new Error('Phishing feed exceeded the download budget.'))
                    return
                }
                callback(null, chunk)
            }
        })
        const responseStream = Readable.fromWeb(response.body)
        responseStream.once('error', (error) => compressedLimit.destroy(error))
        const gzipStream = responseStream.pipe(compressedLimit)
        const result = await buildBrowserThreatDatabaseFromGzip({
            gzipStream,
            outputPath: workerData.outputPath,
            etag: response.headers.get('etag'),
            lastModified: response.headers.get('last-modified'),
            maxDatabaseBytes: BROWSER_THREAT_DATABASE_MAX_BYTES,
            maxEntries: BROWSER_THREAT_FEED_MAX_ENTRIES,
            maxUncompressedBytes: BROWSER_THREAT_FEED_MAX_UNCOMPRESSED_BYTES
        })
        return {
            notModified: false,
            compressedBytes,
            etag: response.headers.get('etag'),
            lastModified: response.headers.get('last-modified'),
            ...result
        }
    } finally {
        clearTimeout(timeout)
    }
}

run().then(
    (result) => parentPort?.postMessage({ type: 'result', result }),
    (error) => parentPort?.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Phishing feed update failed.'
    })
)
