import { createHash } from 'node:crypto'

const BROWSER_THREAT_URL_MAX_LENGTH = 65_536
export const BROWSER_THREAT_TEST_URL = 'http://www.internetbadguys.com/'
const BROWSER_THREAT_TEST_HOSTNAMES = new Set(['internetbadguys.com', 'www.internetbadguys.com'])

function parseIpv4(hostname: string): number[] | null {
    const parts = hostname.split('.')
    if (parts.length !== 4) return null
    const octets = parts.map((part) => Number(part))
    return octets.every((octet, index) => Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === parts[index])
        ? octets
        : null
}

export function isLocalBrowserThreatHostname(value: string): boolean {
    const hostname = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (!hostname) return true
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true
    if (/^(?:fc|fd|fe[89ab])[0-9a-f]*:/iu.test(hostname)) return true
    const ipv4 = parseIpv4(hostname)
    if (!ipv4) return false
    return ipv4[0] === 10
        || ipv4[0] === 127
        || (ipv4[0] === 169 && ipv4[1] === 254)
        || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
        || (ipv4[0] === 192 && ipv4[1] === 168)
}

export function canonicalizeBrowserThreatUrl(value: string): string | null {
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

export function hashBrowserThreatUrl(value: string): Buffer | null {
    const canonical = canonicalizeBrowserThreatUrl(value)
    return canonical ? createHash('sha256').update(canonical).digest().subarray(0, 16) : null
}

export function isBrowserThreatTestUrl(value: string): boolean {
    const canonical = canonicalizeBrowserThreatUrl(value)
    return canonical ? BROWSER_THREAT_TEST_HOSTNAMES.has(new URL(canonical).hostname) : false
}
