const GENERIC_USER_FOLDER_NAMES = new Set([
    '3d objects',
    'contacts',
    'desktop',
    'documents',
    'downloads',
    'favorites',
    'links',
    'music',
    'onedrive',
    'pictures',
    'saved games',
    'searches',
    'videos'
])

function normalizePath(value: string): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isGenericUserFolderPath(projectPath: string, userHomePath?: string | null): boolean {
    const normalized = normalizePath(projectPath)
    if (!normalized) return false
    const lower = normalized.toLowerCase()
    const normalizedHome = normalizePath(userHomePath || '').toLowerCase()

    if (normalizedHome) {
        if (lower === normalizedHome) return true
        if (lower.startsWith(`${normalizedHome}/`)) {
            const relativeParts = lower.slice(normalizedHome.length + 1).split('/').filter(Boolean)
            return relativeParts.length === 1 && GENERIC_USER_FOLDER_NAMES.has(relativeParts[0]!)
        }
    }

    const windowsProfile = lower.match(/^[a-z]:\/users\/[^/]+(?:\/([^/]+))?$/i)
    if (windowsProfile) return !windowsProfile[1] || GENERIC_USER_FOLDER_NAMES.has(windowsProfile[1])

    const posixProfile = lower.match(/^\/(?:home|users)\/[^/]+(?:\/([^/]+))?$/i)
    return Boolean(posixProfile && (!posixProfile[1] || GENERIC_USER_FOLDER_NAMES.has(posixProfile[1])))
}
