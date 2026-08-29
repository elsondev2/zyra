const ASSISTANT_FILES_WORKSPACE = 'files'
const SHELL_LAUNCH_MARKER = '1'
const MAX_SHELL_LAUNCH_PATH_LENGTH = 32_768

export type AssistantFilesShellLaunchRequest = {
    id: string
    folderPath: string
}

function normalizeSearch(search: string): URLSearchParams {
    return new URLSearchParams(String(search || '').replace(/^\?/, ''))
}

function normalizeFolderPath(value: string | null | undefined): string | null {
    const folderPath = String(value || '').trim()
    if (!folderPath || folderPath.length > MAX_SHELL_LAUNCH_PATH_LENGTH || folderPath.includes('\0')) return null
    return folderPath
}

export function buildAssistantFilesShellLaunchRoute(folderPath: string, preservedSearch = ''): string {
    const normalizedPath = normalizeFolderPath(folderPath)
    if (!normalizedPath) return '/assistant'

    const search = normalizeSearch(preservedSearch)
    search.set('shellLaunch', SHELL_LAUNCH_MARKER)
    search.set('workspace', ASSISTANT_FILES_WORKSPACE)
    search.set('path', normalizedPath)
    return `/assistant?${search.toString()}`
}

export function parseAssistantFilesShellLaunchRequest(searchValue: string): AssistantFilesShellLaunchRequest | null {
    const search = normalizeSearch(searchValue)
    if (search.get('shellLaunch') !== SHELL_LAUNCH_MARKER || search.get('workspace') !== ASSISTANT_FILES_WORKSPACE) return null

    const folderPath = normalizeFolderPath(search.get('path'))
    if (!folderPath) return null
    return {
        id: `/assistant?${search.toString()}`,
        folderPath
    }
}

export function migrateLegacyExplorerShellLaunchRoute(pathname: string, searchValue: string): string {
    const search = normalizeSearch(searchValue)
    if (search.get('shellLaunch') !== SHELL_LAUNCH_MARKER) return '/assistant'

    const prefix = '/explorer/'
    if (!pathname.startsWith(prefix)) return '/assistant'
    const encodedPath = pathname.slice(prefix.length)
    if (!encodedPath) return '/assistant'

    try {
        return buildAssistantFilesShellLaunchRoute(decodeURIComponent(encodedPath), searchValue)
    } catch {
        return '/assistant'
    }
}
