import {
    getFileExtensionFromName,
    getParentFolderPath,
    validateCreateName
} from '@/lib/filesystem/fileSystemPaths'

export const BROWSE_ITEMS_PAGE_SIZE = 180
export {
    getFileExtensionFromName,
    getParentFolderPath,
    validateCreateName
} from '@/lib/filesystem/fileSystemPaths'

export type FolderBrowseMode = 'projects' | 'explorer'

export type FileSystemClipboardItem = {
    path: string
    name: string
    type: 'file' | 'directory'
}

export type FolderBrowseBreadcrumbSegment = {
    label: string
    path: string
}

export type CreateFileSystemTarget = {
    destinationDirectory: string
    type: 'file' | 'directory'
    presetExtension?: string
}

export async function yieldToBrowserPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => resolve())
            return
        }
        setTimeout(resolve, 0)
    })
}

export function splitFileNameForRename(name: string): { baseName: string; extensionSuffix: string } {
    const raw = String(name || '')
    const dotIndex = raw.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === raw.length - 1) {
        return { baseName: raw, extensionSuffix: '' }
    }
    return {
        baseName: raw.slice(0, dotIndex),
        extensionSuffix: raw.slice(dotIndex)
    }
}

export function normalizePath(path: string): string {
    const raw = String(path || '').trim().replace(/\//g, '\\')
    if (!raw) return ''
    if (/^[A-Za-z]:\\?$/.test(raw)) return `${raw.slice(0, 2)}\\`
    if (/^\\\\[^\\]+\\[^\\]+\\?$/.test(raw)) return raw.replace(/[\\]+$/, '')
    return raw.replace(/[\\]+$/, '')
}

export function isPathWithinRoot(path: string, root: string): boolean {
    const normalizedPath = normalizePath(path).toLowerCase()
    const normalizedRoot = normalizePath(root).toLowerCase()
    if (!normalizedPath || !normalizedRoot) return false
    if (normalizedPath === normalizedRoot) return true
    return normalizedPath.startsWith(`${normalizedRoot}\\`)
}

export function formatRootRelativePath(path: string, root: string | null | undefined): string {
    const normalizedPath = normalizePath(path)
    const normalizedRoot = normalizePath(root || '')
    if (!normalizedPath || !normalizedRoot || !isPathWithinRoot(normalizedPath, normalizedRoot)) {
        return path
    }

    const rootName = normalizedRoot.split('\\').filter(Boolean).pop() || normalizedRoot
    const relativeSuffix = normalizedPath.slice(normalizedRoot.length).replace(/^\\+/, '')
    return relativeSuffix ? `~\\${rootName}\\${relativeSuffix}` : `~\\${rootName}`
}

export function buildRootRelativeBreadcrumbSegments(
    path: string,
    root: string | null | undefined
): FolderBrowseBreadcrumbSegment[] {
    const normalizedPath = normalizePath(path)
    const normalizedRoot = normalizePath(root || '')
    if (!normalizedPath) return []

    if (!normalizedRoot || !isPathWithinRoot(normalizedPath, normalizedRoot)) {
        const parts = normalizedPath.split('\\').filter(Boolean)
        return parts.map((part, index) => ({
            label: index === 0 && /^[A-Za-z]:$/.test(part) ? `${part}\\` : part,
            path: parts.slice(0, index + 1).join('\\')
        }))
    }

    const rootName = normalizedRoot.split('\\').filter(Boolean).pop() || normalizedRoot
    const relativeParts = normalizedPath.slice(normalizedRoot.length).replace(/^\\+/, '').split('\\').filter(Boolean)
    const segments: FolderBrowseBreadcrumbSegment[] = [{
        label: `~\\${rootName}`,
        path: normalizedRoot
    }]

    let currentPath = normalizedRoot
    for (const part of relativeParts) {
        currentPath = `${currentPath}\\${part}`
        segments.push({ label: part, path: currentPath })
    }

    return segments
}

export function resolveNavigationRoot(path: string, roots: string[]): string | null {
    const normalizedPath = normalizePath(path)
    if (!normalizedPath) return null

    const matchingRoots = roots
        .map((root) => normalizePath(root))
        .filter((root) => root.length > 0)
        .filter((root) => isPathWithinRoot(normalizedPath, root))

    if (matchingRoots.length === 0) return null
    matchingRoots.sort((left, right) => right.length - left.length)
    return matchingRoots[0]
}

export function getParentFolderPathWithinRoot(currentPath: string, rootLimit: string | null): string | null {
    const normalizedCurrentPath = normalizePath(currentPath)
    const normalizedRootLimit = normalizePath(rootLimit || '')

    if (!normalizedCurrentPath) return null
    if (normalizedRootLimit && normalizedCurrentPath.toLowerCase() === normalizedRootLimit.toLowerCase()) return null

    const parent = getParentFolderPath(normalizedCurrentPath)
    if (!parent) return null

    if (!normalizedRootLimit) {
        return parent
    }

    if (!isPathWithinRoot(parent, normalizedRootLimit)) {
        return null
    }

    return parent
}

export function buildBrowseRoute(mode: FolderBrowseMode, path?: string): string {
    const baseRoute = mode === 'explorer' ? '/explorer' : '/folder-browse'
    if (!path) {
        return mode === 'explorer' ? '/explorer' : '/projects'
    }
    return `${baseRoute}/${encodeURIComponent(path)}`
}
