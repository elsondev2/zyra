import type {
    DevScopeIndexedPathEntry,
    DevScopeIndexedPathSearchResult
} from '@shared/contracts/devscope-project-contracts'

export type IndexedProjectPathSnapshot = DevScopeIndexedPathSearchResult

type ProjectPathSearchCacheEntry = {
    expiresAt: number
    promise: Promise<IndexedProjectPathSnapshot | null>
}

const PROJECT_PATH_SEARCH_TTL_MS = 30_000
const MAX_PROJECT_PATH_SEARCH_ENTRIES = 160
const projectPathSearchCache = new Map<string, ProjectPathSearchCacheEntry>()

export function normalizeIndexedPath(pathValue: string): string {
    return String(pathValue || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

export function normalizeIndexedPathKey(pathValue: string): string {
    return normalizeIndexedPath(pathValue).toLowerCase()
}

export function indexedPathBasename(pathValue: string): string {
    return normalizeIndexedPath(pathValue).split('/').pop() || ''
}

export function isIndexedPathWithinRoot(pathValue: string, rootPath: string): boolean {
    const pathKey = normalizeIndexedPathKey(pathValue)
    const rootKey = normalizeIndexedPathKey(rootPath)
    return Boolean(rootKey && (pathKey === rootKey || pathKey.startsWith(`${rootKey}/`)))
}

export function toIndexedRelativePath(pathValue: string, rootPath: string): string {
    const normalizedPath = normalizeIndexedPath(pathValue)
    const normalizedRoot = normalizeIndexedPath(rootPath)
    const pathKey = normalizedPath.toLowerCase()
    const rootKey = normalizedRoot.toLowerCase()
    if (pathKey === rootKey) return ''
    if (!pathKey.startsWith(`${rootKey}/`)) return normalizedPath
    return normalizedPath.slice(normalizedRoot.length + 1)
}

function retainProjectPathSearchEntry(key: string, entry: ProjectPathSearchCacheEntry): void {
    projectPathSearchCache.delete(key)
    projectPathSearchCache.set(key, entry)
    while (projectPathSearchCache.size > MAX_PROJECT_PATH_SEARCH_ENTRIES) {
        const oldestKey = projectPathSearchCache.keys().next().value as string | undefined
        if (!oldestKey) break
        projectPathSearchCache.delete(oldestKey)
    }
}

export function searchIndexedProjectPaths(
    projectRoot: string,
    term: string
): Promise<IndexedProjectPathSnapshot | null> {
    const normalizedRoot = normalizeIndexedPath(projectRoot)
    const normalizedTerm = String(term || '').trim()
    if (!normalizedRoot || !normalizedTerm) return Promise.resolve(null)

    const key = `${normalizeIndexedPathKey(normalizedRoot)}|${normalizedTerm.toLowerCase()}`
    const now = Date.now()
    const cached = projectPathSearchCache.get(key)
    if (cached && cached.expiresAt > now) {
        retainProjectPathSearchEntry(key, cached)
        return cached.promise
    }

    const entry: ProjectPathSearchCacheEntry = {
        expiresAt: now + PROJECT_PATH_SEARCH_TTL_MS,
        promise: Promise.resolve(null)
    }
    entry.promise = window.devscope.searchIndexedPaths({
        scopePath: normalizedRoot,
        term: normalizedTerm,
        limit: 80,
        includeFiles: true,
        includeDirectories: true,
        showHidden: false
    }).then((result) => {
        if (!result?.success) return null
        return {
            entries: result.entries || [],
            ancestors: result.ancestors || [],
            totalMatched: Number(result.totalMatched) || 0
        }
    }).catch(() => null)

    retainProjectPathSearchEntry(key, entry)
    return entry.promise
}

export function findExactIndexedPathMatches(
    snapshot: IndexedProjectPathSnapshot | null,
    targetPath: string,
    projectRoot: string
): DevScopeIndexedPathEntry[] {
    if (!snapshot) return []
    const targetName = indexedPathBasename(targetPath).toLowerCase()
    const targetRelativeKey = normalizeIndexedPathKey(toIndexedRelativePath(targetPath, projectRoot))
    const targetPathKey = normalizeIndexedPathKey(targetPath)
    const exactPathMatches = snapshot.entries.filter((entry) => {
        const entryPathKey = normalizeIndexedPathKey(entry.path)
        const entryRelativeKey = normalizeIndexedPathKey(entry.relativePath)
        return entryPathKey === targetPathKey || (targetRelativeKey && entryRelativeKey === targetRelativeKey)
    })
    if (exactPathMatches.length > 0) return exactPathMatches
    const shorthandKey = targetRelativeKey.replace(/^(?:\.\/)+/, '')
    const suffixMatches = shorthandKey
        ? snapshot.entries.filter((entry) => {
            const entryRelativeKey = normalizeIndexedPathKey(entry.relativePath)
            return entryRelativeKey === shorthandKey || entryRelativeKey.endsWith(`/${shorthandKey}`)
        })
        : []
    if (suffixMatches.length > 0) return suffixMatches
    return snapshot.entries.filter((entry) => entry.name.toLowerCase() === targetName)
}

export function resetIndexedProjectPathCache(): void {
    projectPathSearchCache.clear()
}
