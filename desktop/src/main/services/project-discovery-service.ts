import { access, readdir, readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
import log from 'electron-log'
import {
    detectFrameworksFromPackageJson,
    detectProjectTypeFromMarkers,
    PROJECT_MARKERS,
    type FrameworkDefinition,
    type ProjectTypeDefinition
} from '../ipc/project-detection'
import { indexFilesAcrossFolders } from './file-index-service'
import { resolveProjectIconPath } from './project-icon-resolver'

export type ScannedProject = {
    name: string
    path: string
    type: string
    projectIconPath?: string | null
    typeInfo?: ProjectTypeDefinition
    markers: string[]
    frameworks: string[]
    frameworkInfo?: FrameworkDefinition[]
    lastModified?: number
    isProject: boolean
}

export type ScannedFolder = {
    name: string
    path: string
    lastModified?: number
    isProject: boolean
}

export type ScannedFile = {
    name: string
    path: string
    size: number
    lastModified?: number
    extension: string
}

export type ScanProjectsSuccess = {
    success: true
    projects: ScannedProject[]
    folders: ScannedFolder[]
    files: ScannedFile[]
    cached?: boolean
    cachedAt?: number
}

export type ScanProjectsError = {
    success: false
    error: string
}

export type ScanProjectsResult = ScanProjectsSuccess | ScanProjectsError
type ScanProjectsOptions = {
    forceRefresh?: boolean
}

type IndexAllFoldersOptions = {
    forceRefresh?: boolean
}

type IndexAllFoldersResult = {
    success: boolean
    projects: Array<ScannedProject & { sourceFolder: string; depth: number }>
    totalFolders: number
    indexedFolders: number
    indexedFiles: number
    scannedFolderPaths: string[]
    indexedCount: number
    errors?: Array<{ folder: string; error: string }>
}

const SCAN_PROJECTS_CACHE_TTL_MS = 2 * 60 * 1000
const scanProjectsCache = new Map<string, { timestamp: number; value: ScanProjectsSuccess }>()
const scanProjectsInFlight = new Map<string, Promise<ScanProjectsResult>>()
const indexAllFoldersCache = new Map<string, { timestamp: number; value: IndexAllFoldersResult }>()
const indexAllFoldersInFlight = new Map<string, Promise<IndexAllFoldersResult>>()

function normalizeScanPathKey(folderPath: string): string {
    return folderPath.replace(/\\/g, '/').toLowerCase()
}

function normalizeIndexFolders(folders: string[]): string[] {
    return Array.from(new Set(
        folders
            .map((folder) => String(folder || '').trim())
            .filter(Boolean)
    ))
}

function normalizeIndexAllFoldersKey(folders: string[]): string {
    return normalizeIndexFolders(folders)
        .map((folder) => normalizeScanPathKey(folder))
        .sort((left, right) => left.localeCompare(right))
        .join('||')
}

function getCachedScanProjects(folderPath: string): ScanProjectsSuccess | null {
    const key = normalizeScanPathKey(folderPath)
    const cached = scanProjectsCache.get(key)
    if (!cached) return null

    const ageMs = Date.now() - cached.timestamp
    if (ageMs > SCAN_PROJECTS_CACHE_TTL_MS) {
        scanProjectsCache.delete(key)
        return null
    }

    return {
        ...cached.value,
        cached: true,
        cachedAt: cached.timestamp
    }
}

function cacheScanProjects(folderPath: string, value: ScanProjectsSuccess): void {
    scanProjectsCache.set(normalizeScanPathKey(folderPath), {
        timestamp: Date.now(),
        value
    })
}

export function invalidateScanProjectsCache(folderPath: string, options?: { includeParents?: boolean }): void {
    const includeParents = options?.includeParents ?? true
    const normalizedInput = String(folderPath || '').trim()
    if (!normalizedInput) return

    let currentPath = normalizedInput
    const visited = new Set<string>()

    while (currentPath) {
        const key = normalizeScanPathKey(currentPath)
        if (visited.has(key)) break
        visited.add(key)
        scanProjectsCache.delete(key)
        scanProjectsInFlight.delete(key)

        if (!includeParents) break

        const parentPath = dirname(currentPath)
        if (normalizeScanPathKey(parentPath) === key) break
        currentPath = parentPath
    }

    indexAllFoldersCache.clear()
    indexAllFoldersInFlight.clear()
}

async function scanProjectsUncached(folderPath: string): Promise<ScanProjectsResult> {
    await access(folderPath)
    const entries = await readdir(folderPath, { withFileTypes: true })
    const projects: ScannedProject[] = []
    const folders: ScannedFolder[] = []
    const files: ScannedFile[] = []

    for (const entry of entries) {
        if (entry.isFile()) {
            const isHidden = entry.name.startsWith('.')
            if (!isHidden) {
                try {
                    const filePath = join(folderPath, entry.name)
                    const stats = await stat(filePath)
                    const ext = entry.name.includes('.') ? entry.name.split('.').pop() || '' : ''
                    files.push({
                        name: entry.name,
                        path: filePath,
                        size: stats.size,
                        lastModified: stats.mtimeMs,
                        extension: ext
                    })
                } catch {
                    // Skip files we cannot stat.
                }
            }
            continue
        }

        if (!entry.isDirectory()) continue
        if (entry.name === 'node_modules') continue

        const isHidden = entry.name.startsWith('.')
        const projectPath = join(folderPath, entry.name)
        const markers: string[] = []
        let frameworks: string[] = []
        let frameworkInfo: FrameworkDefinition[] = []
        let packageJson: any = null

        try {
            const projectEntries = await readdir(projectPath)

            if (projectEntries.includes('.git')) {
                markers.push('.git')
            }

            for (const marker of PROJECT_MARKERS) {
                if (marker === '.git') continue
                if (marker.startsWith('*')) {
                    const ext = marker.slice(1)
                    if (projectEntries.some((projectEntry) => projectEntry.endsWith(ext))) {
                        markers.push(marker)
                    }
                } else if (projectEntries.includes(marker)) {
                    markers.push(marker)
                }
            }

            const projectType = detectProjectTypeFromMarkers(markers)
            if (projectType?.id === 'node' && projectEntries.includes('package.json')) {
                try {
                    const pkgPath = join(projectPath, 'package.json')
                    const pkgContent = await readFile(pkgPath, 'utf-8')
                    packageJson = JSON.parse(pkgContent)
                    frameworkInfo = detectFrameworksFromPackageJson(packageJson, projectEntries)
                    frameworks = frameworkInfo.map((framework) => framework.id)
                } catch (err) {
                    log.warn(`Could not parse package.json in ${projectPath}`, err)
                }
            }

            const stats = await stat(projectPath)
            const projectIconPath = await resolveProjectIconPath(projectPath, projectEntries, packageJson)

            if (markers.length > 0) {
                projects.push({
                    name: entry.name,
                    path: projectPath,
                    type: projectType?.id || 'unknown',
                    projectIconPath,
                    typeInfo: projectType,
                    markers,
                    frameworks,
                    frameworkInfo,
                    lastModified: stats.mtimeMs,
                    isProject: true
                })
            } else if (!isHidden) {
                folders.push({
                    name: entry.name,
                    path: projectPath,
                    lastModified: stats.mtimeMs,
                    isProject: false
                })
            }
        } catch (err) {
            log.warn(`Could not scan project folder: ${projectPath}`, err)
        }
    }

    projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    folders.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    return { success: true, projects, folders, files }
}

export async function scanProjects(folderPath: string, options?: ScanProjectsOptions): Promise<ScanProjectsResult> {
    if (options?.forceRefresh) {
        invalidateScanProjectsCache(folderPath, { includeParents: false })
    }

    const cached = getCachedScanProjects(folderPath)
    if (cached) {
        return cached
    }

    const key = normalizeScanPathKey(folderPath)
    const inFlight = scanProjectsInFlight.get(key)
    if (inFlight) {
        return await inFlight
    }

    const scanPromise = (async () => {
        try {
            const result = await scanProjectsUncached(folderPath)
            if (result.success) {
                cacheScanProjects(folderPath, result)
            }
            return result
        } catch (err: any) {
            const errorResult: ScanProjectsError = { success: false, error: err?.message || 'Failed to scan projects' }
            return errorResult
        } finally {
            scanProjectsInFlight.delete(key)
        }
    })()

    scanProjectsInFlight.set(key, scanPromise)
    return await scanPromise
}

function getCachedIndexAllFolders(folders: string[]): IndexAllFoldersResult | null {
    const key = normalizeIndexAllFoldersKey(folders)
    const cached = indexAllFoldersCache.get(key)
    if (!cached) return null

    const ageMs = Date.now() - cached.timestamp
    if (ageMs > SCAN_PROJECTS_CACHE_TTL_MS) {
        indexAllFoldersCache.delete(key)
        return null
    }

    return cached.value
}

function cacheIndexAllFolders(folders: string[], value: IndexAllFoldersResult): void {
    indexAllFoldersCache.set(normalizeIndexAllFoldersKey(folders), {
        timestamp: Date.now(),
        value
    })
}

async function indexAllFoldersUncached(
    folders: string[],
    _options?: IndexAllFoldersOptions
): Promise<IndexAllFoldersResult> {
    return await indexFilesAcrossFolders(folders)
}

export async function indexAllFolders(
    folders: string[],
    options?: IndexAllFoldersOptions
): Promise<IndexAllFoldersResult> {
    const normalizedFolders = normalizeIndexFolders(folders)
    const key = normalizeIndexAllFoldersKey(normalizedFolders)

    if (options?.forceRefresh) {
        indexAllFoldersCache.delete(key)
        indexAllFoldersInFlight.delete(key)
    } else {
        const cached = getCachedIndexAllFolders(normalizedFolders)
        if (cached) return cached

        const inFlight = indexAllFoldersInFlight.get(key)
        if (inFlight) {
            return await inFlight
        }
    }

    const indexPromise = (async () => {
        try {
            const result = await indexAllFoldersUncached(normalizedFolders, options)
            cacheIndexAllFolders(normalizedFolders, result)
            return result
        } finally {
            indexAllFoldersInFlight.delete(key)
        }
    })()

    indexAllFoldersInFlight.set(key, indexPromise)
    return await indexPromise
}
