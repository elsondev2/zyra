/**
 * Utility function for conditionally joining classNames
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ')
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0 || !bytes) return '0 GB'
    const gb = bytes / 1024 / 1024 / 1024
    return `${gb.toFixed(2)} GB`
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
}

export type ParsedFileSearchQuery = {
    term: string
    extension: string | null
    hasExtensionFilter: boolean
    isExtensionOnly: boolean
}

const FILE_EXTENSION_TOKEN = /^\.[a-z0-9][a-z0-9_-]*$/i

export function parseFileSearchQuery(query: string): ParsedFileSearchQuery {
    const trimmed = query.trim()
    if (!trimmed) {
        return { term: '', extension: null, hasExtensionFilter: false, isExtensionOnly: false }
    }

    const parts = trimmed.split(/\s+/)
    const extensionTokenIndex = parts.findIndex(part => FILE_EXTENSION_TOKEN.test(part))

    if (extensionTokenIndex === -1) {
        return { term: trimmed.toLowerCase(), extension: null, hasExtensionFilter: false, isExtensionOnly: false }
    }

    const extension = parts[extensionTokenIndex].slice(1).toLowerCase()
    parts.splice(extensionTokenIndex, 1)
    const term = parts.join(' ').trim().toLowerCase()

    return {
        term,
        extension,
        hasExtensionFilter: true,
        isExtensionOnly: term.length === 0
    }
}

export function getFileExtension(fileName: string): string {
    const normalized = fileName.toLowerCase()
    if (!normalized) return ''

    // Treat dotfiles like ".env" as extension "env".
    if (normalized.startsWith('.') && normalized.indexOf('.', 1) === -1) {
        return normalized.slice(1)
    }

    const dotIndex = normalized.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === normalized.length - 1) return ''
    return normalized.slice(dotIndex + 1)
}

export function fileNameMatchesQuery(fileName: string, parsed: ParsedFileSearchQuery): boolean {
    const nameLower = fileName.toLowerCase()
    const matchesTerm = !parsed.term || nameLower.includes(parsed.term)
    if (!matchesTerm) return false

    if (!parsed.hasExtensionFilter || !parsed.extension) return true
    return getFileExtension(nameLower) === parsed.extension
}
