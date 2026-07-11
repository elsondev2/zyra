type ProjectDetailsLike = Record<string, any>
type FileTreeLike = any[]
type GitSnapshotLike = Record<string, any>

const CACHE_TTL_MS = 2 * 60 * 1000
const PERSISTED_GIT_CACHE_TTL_MS = 30 * 60 * 1000
const PERSISTED_GIT_CACHE_KEY_PREFIX = 'devscope:git-snapshot:v1:'

const projectDetailsCache = new Map<string, { value: ProjectDetailsLike; updatedAt: number }>()
const fileTreeCache = new Map<string, { value: FileTreeLike; updatedAt: number }>()
const previewFolderTreeCache = new Map<string, { value: FileTreeLike; updatedAt: number }>()
const gitSnapshotCache = new Map<string, { value: GitSnapshotLike; updatedAt: number }>()

function normalizePathKey(projectPath: string): string {
    return String(projectPath || '').trim().replace(/\\/g, '/').toLowerCase()
}

function isFresh(updatedAt: number): boolean {
    return Date.now() - updatedAt <= CACHE_TTL_MS
}

function isPersistedGitSnapshotFresh(updatedAt: number): boolean {
    return Date.now() - updatedAt <= PERSISTED_GIT_CACHE_TTL_MS
}

function getPersistedGitCacheKey(projectPath: string): string | null {
    const key = normalizePathKey(projectPath)
    if (!key) return null
    return `${PERSISTED_GIT_CACHE_KEY_PREFIX}${key}`
}

function removePersistedGitSnapshot(projectPath: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return

    const storageKey = getPersistedGitCacheKey(projectPath)
    if (!storageKey) return

    try {
        window.localStorage.removeItem(storageKey)
    } catch {
        // Ignore storage cleanup errors.
    }
}

function sanitizeGitSnapshotValue(value: unknown): GitSnapshotLike | null {
    if (!value || typeof value !== 'object') return null

    const input = value as Record<string, unknown>
    const asArray = (candidate: unknown) => (Array.isArray(candidate) ? candidate : [])
    const asObject = (candidate: unknown) => (candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {})

    return {
        isGitRepo: typeof input.isGitRepo === 'boolean' ? input.isGitRepo : null,
        gitStatusDetails: asArray(input.gitStatusDetails),
        gitHistory: asArray(input.gitHistory),
        gitHistoryTotalCount: typeof input.gitHistoryTotalCount === 'number' ? input.gitHistoryTotalCount : 0,
        incomingCommits: asArray(input.incomingCommits),
        unpushedCommits: asArray(input.unpushedCommits),
        gitUser: input.gitUser && typeof input.gitUser === 'object' ? input.gitUser : null,
        repoOwner: typeof input.repoOwner === 'string' ? input.repoOwner : null,
        hasRemote: typeof input.hasRemote === 'boolean' ? input.hasRemote : null,
        gitSyncStatus: input.gitSyncStatus && typeof input.gitSyncStatus === 'object' ? input.gitSyncStatus : null,
        gitStatusMap: asObject(input.gitStatusMap),
        branches: asArray(input.branches),
        remotes: asArray(input.remotes),
        tags: asArray(input.tags),
        stashes: asArray(input.stashes)
    }
}

function readPersistedGitSnapshot(projectPath: string): GitSnapshotLike | null {
    if (typeof window === 'undefined' || !window.localStorage) return null

    const storageKey = getPersistedGitCacheKey(projectPath)
    if (!storageKey) return null

    try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return null

        const parsed = JSON.parse(raw) as { updatedAt?: number; value?: unknown }
        if (!parsed || typeof parsed !== 'object' || typeof parsed.updatedAt !== 'number' || !parsed.value) {
            removePersistedGitSnapshot(projectPath)
            return null
        }

        if (!isPersistedGitSnapshotFresh(parsed.updatedAt)) {
            removePersistedGitSnapshot(projectPath)
            return null
        }

        const sanitizedValue = sanitizeGitSnapshotValue(parsed.value)
        if (!sanitizedValue) {
            removePersistedGitSnapshot(projectPath)
            return null
        }

        gitSnapshotCache.set(normalizePathKey(projectPath), {
            value: sanitizedValue,
            updatedAt: parsed.updatedAt
        })

        return sanitizedValue
    } catch {
        removePersistedGitSnapshot(projectPath)
        return null
    }
}

function writePersistedGitSnapshot(projectPath: string, value: GitSnapshotLike): void {
    if (typeof window === 'undefined' || !window.localStorage) return

    const storageKey = getPersistedGitCacheKey(projectPath)
    if (!storageKey) return

    try {
        window.localStorage.setItem(storageKey, JSON.stringify({
            updatedAt: Date.now(),
            value
        }))
    } catch {
        // Ignore storage quota errors and keep the in-memory cache.
    }
}

export function getCachedProjectDetails(projectPath: string): ProjectDetailsLike | null {
    const key = normalizePathKey(projectPath)
    if (!key) return null
    const cached = projectDetailsCache.get(key)
    if (!cached) return null
    if (!isFresh(cached.updatedAt)) {
        projectDetailsCache.delete(key)
        return null
    }
    return cached.value
}

export function setCachedProjectDetails(projectPath: string, value: ProjectDetailsLike): void {
    const key = normalizePathKey(projectPath)
    if (!key || !value) return
    projectDetailsCache.set(key, { value, updatedAt: Date.now() })
}

function hasRichDetails(value: ProjectDetailsLike): boolean {
    if (!value || typeof value !== 'object') return false
    return Boolean(
        value.readme
        || value.version
        || value.description
        || value.scripts
        || value.dependencies
        || value.devDependencies
        || value.frameworkInfo
        || value.typeInfo
    )
}

export function primeProjectDetailsCache(input: {
    name: string
    path: string
    type: string
    projectIconPath?: string | null
    markers?: string[]
    frameworks?: string[]
    lastModified?: number
}): void {
    const key = normalizePathKey(input.path)
    if (!key) return

    const existing = projectDetailsCache.get(key)
    if (existing && isFresh(existing.updatedAt) && hasRichDetails(existing.value)) {
        return
    }

    projectDetailsCache.set(key, {
        value: {
            name: input.name,
            displayName: input.name,
            path: input.path,
            type: input.type,
            projectIconPath: typeof input.projectIconPath === 'string' ? input.projectIconPath : null,
            markers: Array.isArray(input.markers) ? input.markers : [],
            frameworks: Array.isArray(input.frameworks) ? input.frameworks : [],
            lastModified: typeof input.lastModified === 'number' ? input.lastModified : undefined
        },
        updatedAt: Date.now()
    })
}

export function getCachedFileTree(projectPath: string): FileTreeLike | null {
    const key = normalizePathKey(projectPath)
    if (!key) return null
    const cached = fileTreeCache.get(key)
    if (!cached) return null
    if (!isFresh(cached.updatedAt)) {
        fileTreeCache.delete(key)
        return null
    }
    return cached.value
}

export function setCachedFileTree(projectPath: string, value: FileTreeLike): void {
    const key = normalizePathKey(projectPath)
    if (!key || !Array.isArray(value)) return
    fileTreeCache.set(key, { value, updatedAt: Date.now() })
}

function buildPreviewFolderTreeCacheKey(rootPath: string, folderPath: string): string {
    const normalizedRootPath = normalizePathKey(rootPath)
    const normalizedFolderPath = normalizePathKey(folderPath)
    if (!normalizedRootPath || !normalizedFolderPath) return ''
    return `${normalizedRootPath}::${normalizedFolderPath}`
}

export function getCachedPreviewFolderTree(rootPath: string, folderPath: string): FileTreeLike | null {
    const key = buildPreviewFolderTreeCacheKey(rootPath, folderPath)
    if (!key) return null
    const cached = previewFolderTreeCache.get(key)
    if (!cached) return null
    if (!isFresh(cached.updatedAt)) {
        previewFolderTreeCache.delete(key)
        return null
    }
    return cached.value
}

export function setCachedPreviewFolderTree(rootPath: string, folderPath: string, value: FileTreeLike): void {
    const key = buildPreviewFolderTreeCacheKey(rootPath, folderPath)
    if (!key || !Array.isArray(value)) return
    previewFolderTreeCache.set(key, { value, updatedAt: Date.now() })
}

export function getCachedProjectGitSnapshot(projectPath: string): GitSnapshotLike | null {
    const key = normalizePathKey(projectPath)
    if (!key) return null
    const cached = gitSnapshotCache.get(key)
    if (!cached) return readPersistedGitSnapshot(projectPath)
    if (!isFresh(cached.updatedAt)) {
        gitSnapshotCache.delete(key)
        return readPersistedGitSnapshot(projectPath)
    }
    const sanitizedValue = sanitizeGitSnapshotValue(cached.value)
    if (!sanitizedValue) {
        gitSnapshotCache.delete(key)
        removePersistedGitSnapshot(projectPath)
        return null
    }
    return sanitizedValue
}

export function setCachedProjectGitSnapshot(projectPath: string, value: GitSnapshotLike): void {
    const key = normalizePathKey(projectPath)
    const sanitizedValue = sanitizeGitSnapshotValue(value)
    if (!key || !sanitizedValue) return
    const updatedAt = Date.now()
    gitSnapshotCache.set(key, { value: sanitizedValue, updatedAt })
    writePersistedGitSnapshot(projectPath, sanitizedValue)
}
