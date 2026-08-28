export function normalizePathKey(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/')
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

export function getPathName(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const lastSlashIndex = normalized.lastIndexOf('/')
    return lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized
}
