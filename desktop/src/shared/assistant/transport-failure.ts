const ASSISTANT_TRANSPORT_FAILURE_PATTERN = /\bfetch failed\b|network request failed|socket hang up|econnreset|econnrefused|etimedout|und_err_/i

export function isAssistantTransportFailure(value: unknown): boolean {
    const message = value instanceof Error ? value.message : String(value || '')
    return ASSISTANT_TRANSPORT_FAILURE_PATTERN.test(message)
}
