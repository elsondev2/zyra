const AUTHENTICATION_HOST_PATTERN = /^(?:accounts|account|auth|login|oauth|sso|identity|idp)\./i
const AUTHENTICATION_PATH_PATTERN = /\/(?:oauth2?|authorize|authorization|signin|sign-in|login|log-in|saml|sso|callback|consent|accountchooser)(?:\/|$)/i
const AUTHENTICATION_QUERY_KEYS = new Set([
    'clientid',
    'flowname',
    'gisparams',
    'gislp',
    'gsiwebsdk',
    'prompt',
    'rapt',
    'responsemode',
    'responsetype',
    'scope',
    'upstreamexperimentid'
])

function normalizedQueryKey(value: string): string {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isAuthenticationBrowserUrl(value: string | URL): boolean {
    try {
        const url = value instanceof URL ? value : new URL(value)
        const hostname = url.hostname.toLowerCase()
        if (AUTHENTICATION_HOST_PATTERN.test(hostname) || AUTHENTICATION_PATH_PATTERN.test(url.pathname)) return true
        const keys = [...url.searchParams.keys()].map(normalizedQueryKey)
        if (keys.some((key) => isSensitiveBrowserQueryKey(key))) return true
        return keys.some((key) => AUTHENTICATION_QUERY_KEYS.has(key))
            && (keys.includes('clientid') || keys.includes('responsetype'))
    } catch {
        return false
    }
}

export function isSensitiveBrowserQueryKey(value: string): boolean {
    const normalized = normalizedQueryKey(value)
    if (!normalized) return false
    if (/^(?:code|key|apikey|auth|sig|state|session|samlrequest|samlresponse|relaystate|assertion|jwt|ticket|nonce|otp|challenge|verifier)$/.test(normalized)) return true
    if (/^(?:redirect|redirecturi|redirecturl|redirectto|continue|continueurl|return|returnto|returnurl|returnuri|next|nexturl|url|target|destination|dest|callback|callbackurl)$/.test(normalized)) return true
    return /(?:token|secret|password|passwd|credential|authorization|signature|sessionid|sessionkey|sessiontoken|privatekey|accesskeyid|secretkey|onetime|passcode)/.test(normalized)
}

export function sanitizeBrowserPersistentUrl(value: unknown, maxLength = 2_048): string | null {
    const raw = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
    if (!raw || raw.length > maxLength) return null
    try {
        const url = new URL(raw)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        url.username = ''
        url.password = ''
        if (isAuthenticationBrowserUrl(url)) {
            url.search = ''
        } else {
            for (const key of [...url.searchParams.keys()]) {
                if (isSensitiveBrowserQueryKey(key)) url.searchParams.delete(key)
            }
        }
        url.hash = ''
        return url.toString().slice(0, maxLength)
    } catch {
        return null
    }
}
