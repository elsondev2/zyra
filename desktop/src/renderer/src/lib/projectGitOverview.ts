import type { DevScopeProjectGitOverviewItem } from '@shared/contracts/devscope-git-contracts'

const PROJECT_GIT_OVERVIEW_TTL_MS = 15_000

type CachedProjectGitOverview = {
    value: DevScopeProjectGitOverviewItem
    updatedAt: number
}

const projectGitOverviewCache = new Map<string, CachedProjectGitOverview>()
const projectGitOverviewInFlight = new Map<string, Promise<DevScopeProjectGitOverviewItem | null>>()

function normalizeProjectPathKey(projectPath: string): string {
    return String(projectPath || '').trim().replace(/\\/g, '/').toLowerCase()
}

function isFresh(updatedAt: number): boolean {
    return Date.now() - updatedAt <= PROJECT_GIT_OVERVIEW_TTL_MS
}

function getCachedProjectGitOverviewRecord(projectPath: string): CachedProjectGitOverview | null {
    const cacheKey = normalizeProjectPathKey(projectPath)
    if (!cacheKey) return null
    return projectGitOverviewCache.get(cacheKey) || null
}

function toDefaultProjectGitOverview(projectPath: string, error?: string): DevScopeProjectGitOverviewItem {
    return {
        path: projectPath,
        isGitRepo: false,
        changedCount: 0,
        unpushedCount: 0,
        hasRemote: false,
        ...(error ? { error } : {})
    }
}

function sanitizeProjectGitOverview(
    projectPath: string,
    value: Partial<DevScopeProjectGitOverviewItem> | null | undefined
): DevScopeProjectGitOverviewItem {
    const fallback = toDefaultProjectGitOverview(projectPath)
    if (!value || typeof value !== 'object') {
        return fallback
    }

    return {
        path: typeof value.path === 'string' && value.path.trim() ? value.path : fallback.path,
        isGitRepo: value.isGitRepo === true,
        changedCount: typeof value.changedCount === 'number' ? Math.max(0, value.changedCount) : 0,
        unpushedCount: typeof value.unpushedCount === 'number' ? Math.max(0, value.unpushedCount) : 0,
        hasRemote: value.hasRemote === true,
        ...(typeof value.error === 'string' && value.error.trim() ? { error: value.error } : {})
    }
}

export function getCachedProjectGitOverview(projectPath: string): DevScopeProjectGitOverviewItem | null {
    const cached = getCachedProjectGitOverviewRecord(projectPath)
    if (!cached) return null
    if (!isFresh(cached.updatedAt)) return null

    return cached.value
}

export function setCachedProjectGitOverview(projectPath: string, value: Partial<DevScopeProjectGitOverviewItem>): void {
    const cacheKey = normalizeProjectPathKey(projectPath)
    if (!cacheKey) return

    projectGitOverviewCache.set(cacheKey, {
        value: sanitizeProjectGitOverview(projectPath, value),
        updatedAt: Date.now()
    })
}

export function invalidateProjectGitOverview(projectPath: string): void {
    const cacheKey = normalizeProjectPathKey(projectPath)
    if (!cacheKey) return
    projectGitOverviewCache.delete(cacheKey)
}

export async function readProjectGitOverview(
    projectPath: string,
    options?: { force?: boolean }
): Promise<DevScopeProjectGitOverviewItem | null> {
    const trimmedPath = String(projectPath || '').trim()
    if (!trimmedPath) return null
    const cacheKey = normalizeProjectPathKey(trimmedPath)
    const cachedRecord = getCachedProjectGitOverviewRecord(trimmedPath)
    const staleFallback = cachedRecord?.value || null

    if (!options?.force) {
        if (cachedRecord && isFresh(cachedRecord.updatedAt)) {
            return cachedRecord.value
        }
    }

    const existingRequest = projectGitOverviewInFlight.get(cacheKey)
    if (existingRequest) {
        return existingRequest
    }

    const request = (async () => {
        try {
            const result = await window.devscope.getProjectsGitOverview([trimmedPath])
            if (!result?.success || !Array.isArray(result.items)) {
                const errorMessage = result && !result.success ? result.error : 'Failed to read Git overview.'
                const fallback = staleFallback
                    ? sanitizeProjectGitOverview(trimmedPath, { ...staleFallback, error: errorMessage })
                    : toDefaultProjectGitOverview(trimmedPath, errorMessage)
                setCachedProjectGitOverview(trimmedPath, fallback)
                return fallback
            }

            const match = result.items.find((item) => normalizeProjectPathKey(String(item?.path || '')) === cacheKey)
            if (!match && staleFallback) {
                const fallback = sanitizeProjectGitOverview(
                    trimmedPath,
                    { ...staleFallback, error: 'Failed to find Git overview item.' }
                )
                setCachedProjectGitOverview(trimmedPath, fallback)
                return fallback
            }

            const nextValue = sanitizeProjectGitOverview(trimmedPath, match)
            setCachedProjectGitOverview(trimmedPath, nextValue)
            return nextValue
        } catch (error: any) {
            const fallback = staleFallback
                ? sanitizeProjectGitOverview(trimmedPath, { ...staleFallback, error: error?.message || 'Failed to read Git overview.' })
                : toDefaultProjectGitOverview(trimmedPath, error?.message || 'Failed to read Git overview.')
            setCachedProjectGitOverview(trimmedPath, fallback)
            return fallback
        } finally {
            projectGitOverviewInFlight.delete(cacheKey)
        }
    })()

    projectGitOverviewInFlight.set(cacheKey, request)
    return request
}
