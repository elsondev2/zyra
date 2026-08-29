export type AnalyticsErrorCode =
    | 'aborted'
    | 'already_active'
    | 'authorization_failed'
    | 'config_invalid'
    | 'connection_failed'
    | 'duplicate'
    | 'invalid_input'
    | 'network_unavailable'
    | 'not_configured'
    | 'not_found'
    | 'permission_denied'
    | 'rate_limited'
    | 'renderer_gone'
    | 'timeout'
    | 'transport_failed'
    | 'unavailable'
    | 'unknown'

export function classifyAnalyticsErrorCode(value: unknown): AnalyticsErrorCode {
    const code = value && typeof value === 'object'
        ? String((value as { code?: unknown }).code || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : ''
    if (ANALYTICS_ERROR_CODES.has(code as AnalyticsErrorCode)) return code as AnalyticsErrorCode
    const message = String(value instanceof Error ? value.message : value || '').toLowerCase()
    if (/abort|cancel|interrupt/.test(message)) return 'aborted'
    if (/already|duplicate/.test(message)) return 'already_active'
    if (/permission|denied|forbidden/.test(message)) return 'permission_denied'
    if (/authori[sz]|oauth|credential|login/.test(message)) return 'authorization_failed'
    if (/rate|429/.test(message)) return 'rate_limited'
    if (/timeout|timed out/.test(message)) return 'timeout'
    if (/network|fetch|socket|offline|resolve/.test(message)) return 'network_unavailable'
    if (/not found|enoent/.test(message)) return 'not_found'
    if (/unavailable|not connected|closed|destination/.test(message)) return 'unavailable'
    if (/invalid|malformed|required/.test(message)) return 'invalid_input'
    return 'unknown'
}

const ANALYTICS_ERROR_CODES = new Set<AnalyticsErrorCode>([
    'aborted', 'already_active', 'authorization_failed', 'config_invalid', 'connection_failed',
    'duplicate', 'invalid_input', 'network_unavailable', 'not_configured', 'not_found',
    'permission_denied', 'rate_limited', 'renderer_gone', 'timeout', 'transport_failed',
    'unavailable', 'unknown'
])
