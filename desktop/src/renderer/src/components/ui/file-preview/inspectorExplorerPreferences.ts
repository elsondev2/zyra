export type InspectorExplorerView = 'list' | 'icons'

export type InspectorExplorerPreferences = {
    view: InspectorExplorerView
    showHiddenFiles: boolean
    navigationPaneWidth: number
    currentFolderPath: string | null
    expandedPathKeys: string[]
}

type StoredProjectPreferences = {
    currentFolderPath?: string
    expandedPathKeys?: string[]
    updatedAt: number
}

type StoredInspectorExplorerPreferences = {
    version: 1
    view?: InspectorExplorerView
    showHiddenFiles?: boolean
    navigationPaneWidth?: number
    projects?: Record<string, StoredProjectPreferences>
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'zyra:assistant-inspector-explorer:v1'
const MAX_PROJECT_PREFERENCES = 20
const MAX_EXPANDED_PATHS = 200
export const INSPECTOR_NAVIGATION_PANE_DEFAULT_WIDTH = 252
export const INSPECTOR_NAVIGATION_PANE_MIN_WIDTH = 180
export const INSPECTOR_NAVIGATION_PANE_MAX_WIDTH = 480

function normalizeNavigationPaneWidth(value: unknown): number {
    const width = typeof value === 'number' && Number.isFinite(value) ? value : INSPECTOR_NAVIGATION_PANE_DEFAULT_WIDTH
    return Math.round(Math.min(INSPECTOR_NAVIGATION_PANE_MAX_WIDTH, Math.max(INSPECTOR_NAVIGATION_PANE_MIN_WIDTH, width)))
}

function normalizePath(value: string): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

function pathKey(value: string): string {
    const normalized = normalizePath(value)
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

function getDefaultStorage(): PreferenceStorage | null {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

function readStoredPreferences(storage: PreferenceStorage | null): StoredInspectorExplorerPreferences {
    if (!storage) return { version: 1 }
    try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '') as StoredInspectorExplorerPreferences
        return parsed?.version === 1 && typeof parsed === 'object' ? parsed : { version: 1 }
    } catch {
        return { version: 1 }
    }
}

function isInsideProject(pathValue: string, projectPath: string): boolean {
    const candidate = pathKey(pathValue)
    const root = pathKey(projectPath)
    return candidate === root || candidate.startsWith(`${root}/`)
}

export function readInspectorExplorerPreferences(
    projectPath: string,
    storage: PreferenceStorage | null = getDefaultStorage()
): InspectorExplorerPreferences {
    const stored = readStoredPreferences(storage)
    const project = stored.projects?.[pathKey(projectPath)]
    const currentFolderPath = project?.currentFolderPath && isInsideProject(project.currentFolderPath, projectPath)
        ? project.currentFolderPath
        : null
    const expandedPathKeys = Array.isArray(project?.expandedPathKeys)
        ? project.expandedPathKeys.filter((path) => isInsideProject(path, projectPath)).slice(0, MAX_EXPANDED_PATHS)
        : []
    return {
        view: stored.view === 'icons' ? 'icons' : 'list',
        showHiddenFiles: stored.showHiddenFiles === true,
        navigationPaneWidth: normalizeNavigationPaneWidth(stored.navigationPaneWidth),
        currentFolderPath,
        expandedPathKeys
    }
}

export function writeInspectorExplorerPreferences(
    projectPath: string,
    patch: Partial<InspectorExplorerPreferences>,
    storage: PreferenceStorage | null = getDefaultStorage()
): void {
    if (!storage || !normalizePath(projectPath)) return
    const stored = readStoredPreferences(storage)
    const projectKey = pathKey(projectPath)
    const previousProject = stored.projects?.[projectKey]
    const nextProject: StoredProjectPreferences = {
        currentFolderPath: patch.currentFolderPath && isInsideProject(patch.currentFolderPath, projectPath)
            ? normalizePath(patch.currentFolderPath)
            : previousProject?.currentFolderPath,
        expandedPathKeys: patch.expandedPathKeys
            ? [...new Set(patch.expandedPathKeys.filter((path) => isInsideProject(path, projectPath)).map(normalizePath))].slice(0, MAX_EXPANDED_PATHS)
            : previousProject?.expandedPathKeys,
        updatedAt: Date.now()
    }
    const projects = { ...(stored.projects || {}), [projectKey]: nextProject }
    const retainedProjects = Object.fromEntries(
        Object.entries(projects)
            .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
            .slice(0, MAX_PROJECT_PREFERENCES)
    )
    const next: StoredInspectorExplorerPreferences = {
        version: 1,
        view: patch.view || stored.view,
        showHiddenFiles: typeof patch.showHiddenFiles === 'boolean' ? patch.showHiddenFiles : stored.showHiddenFiles,
        navigationPaneWidth: patch.navigationPaneWidth === undefined
            ? stored.navigationPaneWidth
            : normalizeNavigationPaneWidth(patch.navigationPaneWidth),
        projects: retainedProjects
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Persistence is a convenience; Explorer remains functional if storage is unavailable.
    }
}
