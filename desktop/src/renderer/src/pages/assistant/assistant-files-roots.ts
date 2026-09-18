import type { AssistantChatScopeRoot } from '@shared/assistant/contracts'
import { getPathName, normalizePathKey } from '@/components/ui/file-preview/previewNavigationSidebar.tree'

function pathKey(path: string | null | undefined): string {
    const normalized = normalizePathKey(String(path || '').trim())
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

export function filesRootPathsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
    return pathKey(left) === pathKey(right)
}

export function buildAssistantFilesRoots(projectPath: string | null, projectRoots: readonly AssistantChatScopeRoot[]): AssistantChatScopeRoot[] {
    const seen = new Set<string>()
    const scoped = projectRoots.filter(root => {
        const key = pathKey(root.path)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
    if (!projectPath?.trim() || seen.has(pathKey(projectPath))) return scoped
    return [{ id: `compatibility:${projectPath}`, kind: 'associated-folder', path: projectPath, label: getPathName(projectPath) || 'Working root', access: 'read-write' }, ...scoped]
}

export function findAssistantFilesRoot(roots: readonly AssistantChatScopeRoot[], path: string | null | undefined): AssistantChatScopeRoot | undefined {
    return path ? roots.find(root => filesRootPathsEqual(root.path, path)) : undefined
}

export function defaultAssistantFilesRoot(roots: readonly AssistantChatScopeRoot[], projectPath: string | null): string | null {
    // Compatibility CWD entries (including '.') are not attached Project folders.
    return roots.find(root => root.kind === 'associated-folder' && !root.id.startsWith('compatibility:'))?.path
        || roots.find(root => root.kind === 'project-home')?.path
        || findAssistantFilesRoot(roots, projectPath)?.path
        || roots[0]?.path
        || null
}

export function restoreAssistantFilesRoot(roots: readonly AssistantChatScopeRoot[], projectPath: string | null, capsule?: { rootPath?: string; currentFolderPath?: string }): string | null {
    const saved = findAssistantFilesRoot(roots, capsule?.rootPath)
    if (saved) return saved.path
    // Shell/explicit folder opens carry a folder even when no root capsule exists.
    const requested = pathKey(capsule?.currentFolderPath)
    if (requested) {
        const containing = roots.filter(root => {
            const key = pathKey(root.path)
            return requested === key || requested.startsWith(key.endsWith('/') ? key : `${key}/`)
        }).sort((left, right) => pathKey(right.path).length - pathKey(left.path).length)
        if (containing[0]) return containing[0].path
    }
    return defaultAssistantFilesRoot(roots, projectPath)
}

export function assistantFilesRootContext(roots: readonly AssistantChatScopeRoot[], projectPath: string | null, capsule?: { rootPath?: string; currentFolderPath?: string }): string {
    const home = roots.find(root => root.kind === 'project-home')
    return JSON.stringify([home?.id || '', pathKey(home?.path || projectPath || roots[0]?.path), pathKey(capsule?.rootPath), pathKey(capsule?.currentFolderPath)])
}
