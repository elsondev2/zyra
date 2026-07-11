export function getParentFolderPath(currentPath: string): string | null {
    const raw = String(currentPath || '').trim().replace(/[\\/]+$/, '')
    if (!raw) return null

    if (/^[A-Za-z]:$/.test(raw)) return null
    if (/^\\\\[^\\]+\\[^\\]+$/.test(raw)) return null

    const lastSepIndex = Math.max(raw.lastIndexOf('\\'), raw.lastIndexOf('/'))
    if (lastSepIndex < 0) return null
    if (lastSepIndex === 0 && raw.startsWith('/')) return '/'

    const parent = raw.slice(0, lastSepIndex)
    if (!parent || parent === raw) return null

    if (/^[A-Za-z]:$/.test(parent)) {
        return `${parent}\\`
    }

    return parent
}

export function getFileExtensionFromName(name: string): string {
    const dotIndex = name.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === name.length - 1) return ''
    return name.slice(dotIndex + 1).toLowerCase()
}

export function validateCreateName(name: string): string | null {
    const trimmed = String(name || '').trim()
    if (!trimmed) return 'Name cannot be empty.'
    if (trimmed === '.' || trimmed === '..') return 'Name cannot be "." or "..".'
    if (trimmed.includes('/') || trimmed.includes('\\')) return 'Name cannot include path separators.'
    return null
}
