/** Keep typed font/file bytes intact across the HTTP bridge's JSON boundary. */
export function browserBridgeJsonReplacer(_key: string, value: unknown): unknown {
    return value instanceof Uint8Array ? { type: 'Buffer', data: Array.from(value) } : value
}

export function browserBridgeJsonReviver(_key: string, value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const candidate = value as { type?: unknown; data?: unknown }
    if (candidate.type !== 'Buffer' || !Array.isArray(candidate.data) || Object.keys(value).length !== 2) return value
    if (!candidate.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return value
    return Uint8Array.from(candidate.data)
}
