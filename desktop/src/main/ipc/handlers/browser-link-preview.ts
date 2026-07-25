import { lookup } from 'node:dns/promises'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import type { RequestOptions } from 'node:http'
import type { DevScopeBrowserLinkPreview } from '../../../shared/contracts/devscope-api'

const MAX_LINK_PREVIEW_URL_LENGTH = 2_048
const MAX_LINK_PREVIEW_HTML_BYTES = 256 * 1024
const LINK_PREVIEW_TIMEOUT_MS = 5_000
const LINK_PREVIEW_REDIRECT_LIMIT = 3

const BLOCKED_IPV4_RANGES: Array<{ base: number; prefix: number }> = [
    { base: 0x00000000, prefix: 8 },
    { base: 0x0a000000, prefix: 8 },
    { base: 0x64400000, prefix: 10 },
    { base: 0x7f000000, prefix: 8 },
    { base: 0xa9fe0000, prefix: 16 },
    { base: 0xac100000, prefix: 12 },
    { base: 0xc0000000, prefix: 24 },
    { base: 0xc0a80000, prefix: 16 },
    { base: 0xc6120000, prefix: 15 },
    { base: 0xc6336400, prefix: 24 },
    { base: 0xcb007100, prefix: 24 },
    { base: 0xe0000000, prefix: 4 },
    { base: 0xf0000000, prefix: 4 }
]

type ResolvedPublicAddress = {
    address: string
    family: 4 | 6
}

type FetchedPreviewHtml = {
    finalUrl: string
    html: string
}

function isBlockedHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
    return normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || normalized.endsWith('.local')
        || normalized.endsWith('.internal')
        || normalized.endsWith('.home')
}

function ipv4AddressNumber(address: string): number | null {
    const octets = address.split('.').map((segment) => Number(segment))
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
    return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0
}

function isPublicIpv4Address(address: string): boolean {
    const numericAddress = ipv4AddressNumber(address)
    if (numericAddress === null) return false
    return !BLOCKED_IPV4_RANGES.some(({ base, prefix }) => {
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
        return (numericAddress & mask) === (base & mask)
    })
}

function isPublicIpv6Address(address: string): boolean {
    const normalized = address.toLowerCase().split('%', 1)[0]
    if (normalized === '::' || normalized === '::1' || normalized.includes('.')) return false
    const firstParts = normalized.split(':').filter(Boolean)
    const first = Number.parseInt(firstParts[0] || '0', 16)
    const second = Number.parseInt(firstParts[1] || '0', 16)
    if (!Number.isFinite(first) || !Number.isFinite(second)) return false
    if ((first & 0xfe00) === 0xfc00) return false
    if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return false
    if ((first & 0xff00) === 0xff00) return false
    if (first === 0x2001 && (second === 0x0000 || second === 0x0db8)) return false
    if (first === 0x2002 || (first === 0x0064 && second === 0xff9b)) return false
    return true
}

export function isPublicBrowserLinkPreviewAddress(address: string): boolean {
    const family = isIP(address)
    if (family === 4) return isPublicIpv4Address(address)
    if (family === 6) return isPublicIpv6Address(address)
    return false
}

async function resolvePublicAddress(url: URL): Promise<ResolvedPublicAddress> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS links can be previewed.')
    }
    if (url.username || url.password) throw new Error('Credential-bearing links cannot be previewed.')
    if (isBlockedHostname(url.hostname)) throw new Error('Private or local links cannot be previewed.')

    const literalFamily = isIP(url.hostname)
    if (literalFamily) {
        if (!isPublicBrowserLinkPreviewAddress(url.hostname)) throw new Error('Private or local links cannot be previewed.')
        return { address: url.hostname, family: literalFamily as 4 | 6 }
    }

    const addresses = await lookup(url.hostname, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some((entry) => !isPublicBrowserLinkPreviewAddress(entry.address))) {
        throw new Error('The link did not resolve to a public address.')
    }
    const selected = addresses.find((entry) => entry.family === 4) || addresses[0]
    return { address: selected.address, family: selected.family as 4 | 6 }
}

function normalizePreviewUrl(rawUrl: string): URL {
    const value = String(rawUrl || '').trim()
    if (!value || value.length > MAX_LINK_PREVIEW_URL_LENGTH) throw new Error('A valid link preview URL is required.')
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP and HTTPS links can be previewed.')
    url.hash = ''
    return url
}

function readResponseBody(
    url: URL,
    resolvedAddress: ResolvedPublicAddress,
    redirectCount: number
): Promise<FetchedPreviewHtml> {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === 'https:' ? requestHttps : requestHttp
        const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
            if (lookupOptions.all) {
                callback(null, [{ address: resolvedAddress.address, family: resolvedAddress.family }])
                return
            }
            callback(null, resolvedAddress.address, resolvedAddress.family)
        }
        const options: RequestOptions = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: {
                accept: 'text/html,application/xhtml+xml;q=0.9',
                'accept-language': 'en-US,en;q=0.8',
                'accept-encoding': 'identity',
                'cache-control': 'no-cache',
                connection: 'close',
                'user-agent': 'Mozilla/5.0 (compatible; ZyraLinkPreview/1.0)'
            },
            lookup: pinnedLookup
        }
        const request = transport(options, (response) => {
            const statusCode = response.statusCode || 0
            const location = response.headers.location
            if (statusCode >= 300 && statusCode < 400 && location) {
                response.resume()
                if (redirectCount >= LINK_PREVIEW_REDIRECT_LIMIT) {
                    reject(new Error('The link redirected too many times.'))
                    return
                }
                let redirectUrl: URL
                try {
                    redirectUrl = new URL(location, url)
                } catch {
                    reject(new Error('The link returned an invalid redirect.'))
                    return
                }
                void fetchBrowserLinkPreviewHtml(redirectUrl.toString(), redirectCount + 1).then(resolve, reject)
                return
            }
            if (statusCode < 200 || statusCode >= 300) {
                response.resume()
                reject(new Error(`The site returned HTTP ${statusCode || 'error'}.`))
                return
            }

            const contentType = String(response.headers['content-type'] || '').toLowerCase()
            if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
                response.resume()
                reject(new Error('The link did not return an HTML page.'))
                return
            }
            const chunks: Buffer[] = []
            let receivedBytes = 0
            let settled = false
            const resolveHtml = () => {
                if (settled) return
                settled = true
                resolve({
                    finalUrl: url.toString(),
                    html: Buffer.concat(chunks).toString('utf8')
                })
            }
            response.on('data', (chunk: Buffer | string) => {
                if (settled) return
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
                receivedBytes += buffer.length
                if (receivedBytes > MAX_LINK_PREVIEW_HTML_BYTES) {
                    settled = true
                    request.destroy(new Error('The site metadata is too large to preview.'))
                    reject(new Error('The site metadata is too large to preview.'))
                    return
                }
                chunks.push(buffer)
                if (Buffer.concat(chunks).toString('utf8').toLowerCase().includes('</head>')) {
                    resolveHtml()
                    response.destroy()
                }
            })
            response.on('end', resolveHtml)
        })
        request.setTimeout(LINK_PREVIEW_TIMEOUT_MS, () => request.destroy(new Error('The site preview timed out.')))
        request.on('error', reject)
        request.end()
    })
}

async function fetchBrowserLinkPreviewHtml(rawUrl: string, redirectCount = 0): Promise<FetchedPreviewHtml> {
    const url = normalizePreviewUrl(rawUrl)
    const resolvedAddress = await resolvePublicAddress(url)
    return readResponseBody(url, resolvedAddress, redirectCount)
}

function decodeHtmlEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt);/gi, (entity, token: string) => {
        const normalized = token.toLowerCase()
        if (normalized === 'amp') return '&'
        if (normalized === 'quot') return '"'
        if (normalized === 'apos') return "'"
        if (normalized === 'lt') return '<'
        if (normalized === 'gt') return '>'
        const radix = normalized.startsWith('#x') ? 16 : 10
        const rawCodePoint = normalized.replace(/^#x?/, '')
        const codePoint = Number.parseInt(rawCodePoint, radix)
        return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity
    })
}

function cleanMetadataText(value: string | null | undefined, maxLength: number): string | null {
    const text = decodeHtmlEntities(String(value || ''))
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return text ? text.slice(0, maxLength) : null
}

function parseTagAttributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {}
    const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
    for (const match of tag.matchAll(pattern)) {
        attributes[String(match[1] || '').toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
    }
    return attributes
}

export function parseBrowserLinkPreviewHtml(html: string, pageUrl: string): DevScopeBrowserLinkPreview {
    const boundedHtml = String(html || '').slice(0, MAX_LINK_PREVIEW_HTML_BYTES)
    const head = boundedHtml.match(/<head\b[^>]*>([\s\S]*?)(?:<\/head>|$)/i)?.[1] || boundedHtml
    const metadata = new Map<string, string>()
    for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
        const attributes = parseTagAttributes(match[0])
        const key = String(attributes.property || attributes.name || '').trim().toLowerCase()
        const content = String(attributes.content || '').trim()
        if (key && content && !metadata.has(key)) metadata.set(key, content)
    }

    const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
    const title = cleanMetadataText(metadata.get('og:title') || metadata.get('twitter:title') || titleTag, 240)
    const description = cleanMetadataText(
        metadata.get('og:description') || metadata.get('twitter:description') || metadata.get('description'),
        420
    )
    const siteName = cleanMetadataText(metadata.get('og:site_name'), 120)
    const rawImage = metadata.get('og:image:secure_url') || metadata.get('og:image') || metadata.get('twitter:image') || null
    let imageUrl: string | null = null
    if (rawImage) {
        try {
            const resolvedImage = new URL(decodeHtmlEntities(rawImage), pageUrl)
            if (resolvedImage.protocol === 'http:' || resolvedImage.protocol === 'https:') imageUrl = resolvedImage.toString()
        } catch {
            imageUrl = null
        }
    }

    return {
        url: pageUrl,
        title,
        description,
        imageUrl,
        siteName
    }
}

export async function fetchBrowserLinkPreview(rawUrl: string): Promise<DevScopeBrowserLinkPreview> {
    const fetched = await fetchBrowserLinkPreviewHtml(rawUrl)
    const preview = parseBrowserLinkPreviewHtml(fetched.html, fetched.finalUrl)
    if (preview.imageUrl) {
        try {
            await resolvePublicAddress(normalizePreviewUrl(preview.imageUrl))
            if (!preview.imageUrl.startsWith('https://')) preview.imageUrl = null
        } catch {
            preview.imageUrl = null
        }
    }
    return preview
}
