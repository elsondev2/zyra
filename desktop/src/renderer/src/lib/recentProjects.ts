import type { RecentProjectEntry, RecentProjectRoute } from './recentProjectTypes'

const STORAGE_KEY = 'devscope:recent-projects:v1'
const MAX_ENTRIES = 500

function normalizeProjectPath(projectPath: string): string {
    return projectPath.trim().replace(/\\/g, '/').toLowerCase()
}

function isRecentProjectEntry(value: unknown): value is RecentProjectEntry {
    if (!value || typeof value !== 'object') return false
    const candidate = value as RecentProjectEntry
    return (
        typeof candidate.lastOpenedAt === 'number' &&
        Number.isFinite(candidate.lastOpenedAt) &&
        typeof candidate.openCount === 'number' &&
        Number.isFinite(candidate.openCount) &&
        (candidate.lastRoute === 'project' || candidate.lastRoute === 'folder')
    )
}

function sanitizeStoredMap(value: unknown): Record<string, RecentProjectEntry> {
    if (!value || typeof value !== 'object') return {}

    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key, entry]) => key.length > 0 && isRecentProjectEntry(entry))
        .map(([key, entry]) => [normalizeProjectPath(key), entry] as const)

    return Object.fromEntries(entries) as Record<string, RecentProjectEntry>
}

function saveRecentProjects(entries: Record<string, RecentProjectEntry>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
        // Ignore storage write errors.
    }
}

export function clearRecentProjects(): void {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // Ignore storage cleanup errors.
    }
}

export function getRecentProjects(): Record<string, RecentProjectEntry> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return sanitizeStoredMap(parsed)
    } catch {
        return {}
    }
}

export function getRecentProjectEntry(
    projectPath: string,
    entries: Record<string, RecentProjectEntry> = getRecentProjects()
): RecentProjectEntry | undefined {
    return entries[normalizeProjectPath(projectPath)]
}

export function trackRecentProject(projectPath: string, lastRoute: RecentProjectRoute): void {
    if (!projectPath.trim()) return

    const now = Date.now()
    const key = normalizeProjectPath(projectPath)
    const current = getRecentProjects()
    const existing = current[key]

    current[key] = {
        lastOpenedAt: now,
        openCount: (existing?.openCount || 0) + 1,
        lastRoute
    }

    const entries = Object.entries(current)
    if (entries.length > MAX_ENTRIES) {
        entries.sort((a, b) => a[1].lastOpenedAt - b[1].lastOpenedAt)
        const removeCount = entries.length - MAX_ENTRIES
        for (let i = 0; i < removeCount; i++) {
            delete current[entries[i][0]]
        }
    }

    saveRecentProjects(current)
}
