export function normalizePathKey(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').toLowerCase()
}

export function getPathName(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const lastSlashIndex = normalized.lastIndexOf('/')
    return lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized
}
