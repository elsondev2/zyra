const ASSISTANT_TRANSPORT_FAILURE_PATTERN = /\bfetch failed\b|network request failed|socket hang up|agent-server (?:connection )?closed|agent server is disconnected|econnreset|econnrefused|etimedout|und_err_/i
const ASSISTANT_TRANSPORT_FAILURE_CODES = new Set([
    'AGENT_SERVER_DISCONNECTED',
    'AGENT_SERVER_UNAVAILABLE',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET'
])

export function isAssistantTransportFailure(value: unknown): boolean {
    const message = value instanceof Error ? value.message : String(value || '')
    const code = value && typeof value === 'object' && 'code' in value
        ? String((value as { code?: unknown }).code || '').toUpperCase()
        : ''
    return ASSISTANT_TRANSPORT_FAILURE_CODES.has(code)
        || ASSISTANT_TRANSPORT_FAILURE_PATTERN.test(message)
}
