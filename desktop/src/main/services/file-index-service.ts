import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import log from 'electron-log'
import initSqlJs, { type Database as SqlDatabase, type Statement, type SqlValue } from 'sql.js/dist/sql-asm.js'
import {
    detectFrameworksFromPackageJson,
    detectProjectTypeFromMarkers,
    PROJECT_MARKERS,
    type ProjectTypeDefinition
} from '../ipc/project-detection'
import { resolveProjectIconPath } from './project-icon-resolver'
import type {
    DevScopeIndexedPathEntry,
    DevScopeIndexedPathSearchInput,
    DevScopeIndexedPathSearchResult,
    DevScopeIndexedProject
} from '../../shared/contracts/devscope-project-contracts'

export type FileIndexFoldersResult = {
    success: boolean
    projects: DevScopeIndexedProject[]
    totalFolders: number
    indexedFolders: number
    indexedFiles: number
    scannedFolderPaths: string[]
    indexedCount: number
    errors?: Array<{ folder: string; error: string }>
}

type FileIndexRootRow = {
    rootPath: string
    normalizedRootPath: string
    lastIndexedAt: number
}

type IndexedDirectoryMetadata = {
    markers: string[]
    frameworks: string[]
    projectType: ProjectTypeDefinition | null
    projectIconPath: string | null
}

const FILE_INDEX_SCHEMA_VERSION = 1
const FILE_INDEX_FLUSH_DEBOUNCE_MS = 1200
const FILE_INDEX_YIELD_INTERVAL = 240
const FILE_INDEX_SEARCH_FALLBACK_MULTIPLIER = 6
const SKIP_RECURSIVE_DIRECTORY_NAMES = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'target',
    '__pycache__',
    '.venv',
    'venv',
    '.next',
    '.nuxt',
    '.turbo',
    '.cache',
    'coverage',
    'out'
])

function normalizePathKey(pathValue: string): string {
    const normalized = resolve(String(pathValue || '')).replace(/\\/g, '/')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function resolveEntryName(pathValue: string): string {
    const trimmed = String(pathValue || '').trim()
    if (!trimmed) return ''
    const base = basename(trimmed)
    if (base) return base
    return trimmed.replace(/[\\/]+$/, '')
}

function toRelativePath(rootPath: string, targetPath: string): string {
    const value = relative(rootPath, targetPath).replace(/\\/g, '/')
    return value === '.' ? '' : value
}

function toNullableNumber(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function jsonStringify(value: unknown): string {
    return JSON.stringify(value ?? null)
}

function parseJsonArray(value: SqlValue): string[] {
    if (typeof value !== 'string' || !value) return []
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
    } catch {
        return []
    }
}

function sqlBool(value: boolean): number {
    return value ? 1 : 0
}

function escapeLikeValue(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&')
}

function isPathWithinScope(candidatePath: string, scopePath: string): boolean {
    const normalizedCandidate = normalizePathKey(candidatePath)
    const normalizedScope = normalizePathKey(scopePath)
    return normalizedCandidate === normalizedScope || normalizedCandidate.startsWith(`${normalizedScope}/`)
}

function isRecoverableSqliteError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '')
    const normalized = message.toLowerCase()
    return normalized.includes('database disk image is malformed')
        || normalized.includes('file is not a database')
        || normalized.includes('malformed')
        || normalized.includes('not a database')
}

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolvePromise) => {
        setImmediate(resolvePromise)
    })
}

function minimizeRefreshPaths(paths: string[]): string[] {
    const normalizedPaths = Array.from(new Set(
        paths
            .map((pathValue) => String(pathValue || '').trim())
            .filter(Boolean)
            .map((pathValue) => resolve(pathValue))
    ))

    normalizedPaths.sort((left, right) => left.length - right.length)
    const result: string[] = []

    for (const candidate of normalizedPaths) {
        if (result.some((existing) => isPathWithinScope(candidate, existing))) continue
        result.push(candidate)
    }

    return result
}

function initializeFileIndexSchema(db: SqlDatabase): void {
    db.run(`
        CREATE TABLE IF NOT EXISTS file_index_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_index_roots (
            root_path TEXT PRIMARY KEY,
            normalized_root_path TEXT NOT NULL,
            last_indexed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_index_entries (
            path TEXT PRIMARY KEY,
            normalized_path TEXT NOT NULL,
            root_path TEXT NOT NULL,
            normalized_root_path TEXT NOT NULL,
            parent_path TEXT,
            normalized_parent_path TEXT,
            relative_path TEXT NOT NULL,
            relative_path_lower TEXT NOT NULL,
            name TEXT NOT NULL,
            name_lower TEXT NOT NULL,
            type TEXT NOT NULL,
            extension TEXT NOT NULL,
            size INTEGER,
            last_modified INTEGER,
            is_hidden INTEGER NOT NULL,
            is_project INTEGER NOT NULL,
            project_type TEXT,
            project_icon_path TEXT,
            markers_json TEXT NOT NULL,
            frameworks_json TEXT NOT NULL,
            depth INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_file_index_entries_root ON file_index_entries(root_path, type, is_project);
        CREATE INDEX IF NOT EXISTS idx_file_index_entries_parent ON file_index_entries(root_path, normalized_parent_path);
        CREATE INDEX IF NOT EXISTS idx_file_index_entries_name ON file_index_entries(root_path, name_lower);
        CREATE INDEX IF NOT EXISTS idx_file_index_entries_relative ON file_index_entries(root_path, relative_path_lower);
    `)
    db.run(
        'INSERT OR REPLACE INTO file_index_meta (key, value) VALUES (?, ?)',
        ['schemaVersion', String(FILE_INDEX_SCHEMA_VERSION)]
    )
}

function mapIndexedEntry(row: SqlValue[]): DevScopeIndexedPathEntry {
    return {
        path: String(row[0] || ''),
        rootPath: String(row[1] || ''),
        parentPath: typeof row[2] === 'string' && row[2].length > 0 ? row[2] : null,
        relativePath: String(row[3] || ''),
        name: String(row[4] || ''),
        type: row[5] === 'directory' ? 'directory' : 'file',
        extension: String(row[6] || ''),
        size: typeof row[7] === 'number' ? row[7] : undefined,
        lastModified: typeof row[8] === 'number' ? row[8] : undefined,
        isHidden: row[9] === 1,
        isProject: row[10] === 1,
        projectType: typeof row[11] === 'string' && row[11].length > 0 ? row[11] : null,
        projectIconPath: typeof row[12] === 'string' && row[12].length > 0 ? row[12] : null,
        markers: parseJsonArray(row[13]),
        frameworks: parseJsonArray(row[14]),
        depth: typeof row[15] === 'number' ? row[15] : 0
    }
}

class FileIndexService {
    private readonly filePath: string
    private db: SqlDatabase | null = null
    private initPromise: Promise<void> | null = null
    private operationQueue: Promise<void> = Promise.resolve()
    private writeTimer: NodeJS.Timeout | null = null
    private pendingRefreshPaths = new Set<string>()
    private refreshTimer: NodeJS.Timeout | null = null

    constructor() {
        const indexDir = join(app.getPath('userData'), 'file-index')
        if (!existsSync(indexDir)) {
            mkdirSync(indexDir, { recursive: true })
        }
        this.filePath = join(indexDir, 'file-index.sqlite')
    }

    async indexFolders(folders: string[]): Promise<FileIndexFoldersResult> {
        await this.ensureInitialized()
        const normalizedFolders = Array.from(new Set(
            folders
                .map((folder) => String(folder || '').trim())
                .filter(Boolean)
                .map((folder) => resolve(folder))
        ))

        const errors: Array<{ folder: string; error: string }> = []
        for (const folder of normalizedFolders) {
            try {
                await access(folder)
            } catch (error: any) {
                errors.push({ folder, error: error?.message || 'Folder is unavailable.' })
                continue
            }

            await this.enqueue(async () => {
                await this.reindexRoot(folder)
            }).catch((error: any) => {
                errors.push({ folder, error: error?.message || 'Failed to index folder.' })
            })
        }

        return await this.enqueue(async () => {
            this.scheduleFlush()
            return this.readFolderIndexSummary(normalizedFolders, errors)
        })
    }

    async searchPaths(input: DevScopeIndexedPathSearchInput): Promise<DevScopeIndexedPathSearchResult> {
        await this.ensureInitialized()
        const scopePath = String(input.scopePath || '').trim()
        const roots = Array.from(new Set(
            (input.roots || [])
                .map((root) => String(root || '').trim())
                .filter(Boolean)
                .map((root) => resolve(root))
        ))

        if (scopePath) {
            await this.ensureScopeIndexed(resolve(scopePath))
        } else if (roots.length > 0) {
            await this.ensureRootsIndexed(roots)
        }

        return await this.enqueue(async () => this.searchPathsInternal(input))
    }

    scheduleRefreshPath(pathValue: string): void {
        const normalizedPath = String(pathValue || '').trim()
        if (!normalizedPath) return
        this.pendingRefreshPaths.add(resolve(normalizedPath))
        if (this.refreshTimer) return
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null
            void this.flushPendingRefreshPaths()
        }, 700)
        this.refreshTimer.unref?.()
    }

    private async flushPendingRefreshPaths(): Promise<void> {
        const refreshPaths = minimizeRefreshPaths(Array.from(this.pendingRefreshPaths))
        this.pendingRefreshPaths.clear()
        for (const refreshPath of refreshPaths) {
            await this.ensureInitialized()
            await this.enqueue(async () => {
                await this.reindexSubtree(refreshPath)
                this.scheduleFlush()
            }).catch((error) => {
                log.warn('[FileIndex] Failed to refresh subtree.', refreshPath, error)
            })
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initPromise) return this.initPromise
        this.initPromise = this.initialize()
        return this.initPromise
    }

    private async initialize(): Promise<void> {
        try {
            const SQL = await initSqlJs()
            const dbBytes = existsSync(this.filePath) ? readFileSync(this.filePath) : null
            this.db = dbBytes ? new SQL.Database(dbBytes) : new SQL.Database()
            initializeFileIndexSchema(this.requireDb())
        } catch (error) {
            if (existsSync(this.filePath) && isRecoverableSqliteError(error)) {
                const SQL = await initSqlJs()
                this.db = new SQL.Database()
                initializeFileIndexSchema(this.requireDb())
                await this.flushNow()
                return
            }
            throw error
        }
    }

    private async ensureRootsIndexed(roots: string[]): Promise<void> {
        const missingRoots = await this.enqueue(async () => {
            const storedRoots = this.readIndexedRoots()
            return roots.filter((rootPath) => !storedRoots.some((row) => row.normalizedRootPath === normalizePathKey(rootPath)))
        })

        if (missingRoots.length === 0) return
        await this.indexFolders(missingRoots)
    }

    private async ensureScopeIndexed(scopePath: string): Promise<void> {
        const indexedRoot = await this.enqueue(async () => this.findCoveringRoot(scopePath))
        if (indexedRoot) return
        await this.indexFolders([scopePath])
    }

    private async reindexRoot(rootPath: string): Promise<void> {
        const db = this.requireDb()
        const normalizedRootPath = normalizePathKey(rootPath)
        const timestamp = Date.now()

        db.run('BEGIN')
        try {
            db.run('DELETE FROM file_index_entries WHERE normalized_root_path = ?', [normalizedRootPath])
            db.run('DELETE FROM file_index_roots WHERE normalized_root_path = ?', [normalizedRootPath])

            const insertStatement = db.prepare(`
                INSERT OR REPLACE INTO file_index_entries (
                    path,
                    normalized_path,
                    root_path,
                    normalized_root_path,
                    parent_path,
                    normalized_parent_path,
                    relative_path,
                    relative_path_lower,
                    name,
                    name_lower,
                    type,
                    extension,
                    size,
                    last_modified,
                    is_hidden,
                    is_project,
                    project_type,
                    project_icon_path,
                    markers_json,
                    frameworks_json,
                    depth
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            try {
                await this.indexDirectoryTree(rootPath, rootPath, null, 0, insertStatement)
            } finally {
                insertStatement.free()
            }

            db.run(
                'INSERT INTO file_index_roots (root_path, normalized_root_path, last_indexed_at) VALUES (?, ?, ?)',
                [rootPath, normalizedRootPath, timestamp]
            )
            db.run('COMMIT')
        } catch (error) {
            db.run('ROLLBACK')
            throw error
        }
    }

    private async reindexSubtree(targetPath: string): Promise<void> {
        const db = this.requireDb()
        const existingRoot = this.findCoveringRoot(targetPath)
        if (!existingRoot) {
            await this.reindexRoot(targetPath)
            return
        }

        const normalizedTargetPath = normalizePathKey(targetPath)
        db.run('BEGIN')
        try {
            db.run(
                'DELETE FROM file_index_entries WHERE normalized_root_path = ? AND (normalized_path = ? OR normalized_path LIKE ?)',
                [existingRoot.normalizedRootPath, normalizedTargetPath, `${normalizedTargetPath}/%`]
            )

            const insertStatement = db.prepare(`
                INSERT OR REPLACE INTO file_index_entries (
                    path,
                    normalized_path,
                    root_path,
                    normalized_root_path,
                    parent_path,
                    normalized_parent_path,
                    relative_path,
                    relative_path_lower,
                    name,
                    name_lower,
                    type,
                    extension,
                    size,
                    last_modified,
                    is_hidden,
                    is_project,
                    project_type,
                    project_icon_path,
                    markers_json,
                    frameworks_json,
                    depth
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            try {
                await this.indexPath(existingRoot.rootPath, targetPath, insertStatement)
            } finally {
                insertStatement.free()
            }

            db.run(
                'UPDATE file_index_roots SET last_indexed_at = ? WHERE normalized_root_path = ?',
                [Date.now(), existingRoot.normalizedRootPath]
            )
            db.run('COMMIT')
        } catch (error) {
            db.run('ROLLBACK')
            throw error
        }
    }

    private async indexPath(rootPath: string, targetPath: string, insertStatement: Statement): Promise<void> {
        try {
            const targetStats = await stat(targetPath)
            if (targetStats.isDirectory()) {
                const parentPath = normalizePathKey(targetPath) === normalizePathKey(rootPath) ? null : dirname(targetPath)
                const depth = toRelativePath(rootPath, targetPath).split('/').filter(Boolean).length
                await this.indexDirectoryTree(rootPath, targetPath, parentPath, depth, insertStatement)
                return
            }

            await this.insertFileEntry(rootPath, dirname(targetPath), targetPath, targetStats, insertStatement, depthFromRoot(rootPath, targetPath))
        } catch {
            // Ignore missing paths during incremental refresh.
        }
    }

    private async indexDirectoryTree(
        rootPath: string,
        directoryPath: string,
        parentPath: string | null,
        depth: number,
        insertStatement: Statement
    ): Promise<void> {
        const stack: Array<{ path: string; parentPath: string | null; depth: number }> = [{ path: directoryPath, parentPath, depth }]
        let processedEntries = 0

        while (stack.length > 0) {
            const current = stack.pop()
            if (!current) continue

            try {
                const currentStats = await stat(current.path)
                const entries = await readdir(current.path, { withFileTypes: true })
                const metadata = await this.inspectDirectory(current.path, entries)
                this.insertEntry({
                    rootPath,
                    parentPath: current.parentPath,
                    targetPath: current.path,
                    type: 'directory',
                    extension: '',
                    size: undefined,
                    lastModified: currentStats.mtimeMs,
                    isHidden: resolveEntryName(current.path).startsWith('.'),
                    isProject: metadata.markers.length > 0,
                    projectType: metadata.projectType?.id || null,
                    projectIconPath: metadata.projectIconPath,
                    markers: metadata.markers,
                    frameworks: metadata.frameworks,
                    depth: current.depth
                }, insertStatement)
                processedEntries += 1

                for (const entry of entries) {
                    if (entry.isSymbolicLink()) continue
                    const entryPath = join(current.path, entry.name)
                    if (entry.isDirectory()) {
                        if (SKIP_RECURSIVE_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue
                        stack.push({
                            path: entryPath,
                            parentPath: current.path,
                            depth: current.depth + 1
                        })
                        continue
                    }
                    if (!entry.isFile()) continue
                    try {
                        const fileStats = await stat(entryPath)
                        await this.insertFileEntry(rootPath, current.path, entryPath, fileStats, insertStatement, current.depth + 1)
                        processedEntries += 1
                    } catch (error) {
                        log.warn(`[FileIndex] Failed to stat file ${entryPath}`, error)
                    }
                    if (processedEntries % FILE_INDEX_YIELD_INTERVAL === 0) {
                        await yieldToEventLoop()
                    }
                }
            } catch (error) {
                log.warn(`[FileIndex] Failed to index directory ${current.path}`, error)
            }

            if (processedEntries % FILE_INDEX_YIELD_INTERVAL === 0) {
                await yieldToEventLoop()
            }
        }
    }

    private async inspectDirectory(directoryPath: string, entries: Dirent[]): Promise<IndexedDirectoryMetadata> {
        const entryNames = entries.map((entry) => entry.name)
        const markers: string[] = []
        const lowerEntryNames = new Set(entryNames.map((name) => name.toLowerCase()))

        if (lowerEntryNames.has('.git')) {
            markers.push('.git')
        }

        for (const marker of PROJECT_MARKERS) {
            if (marker === '.git') continue
            if (marker.startsWith('*')) {
                const extension = marker.slice(1).toLowerCase()
                if (entryNames.some((name) => name.toLowerCase().endsWith(extension))) {
                    markers.push(marker)
                }
                continue
            }
            if (lowerEntryNames.has(marker.toLowerCase())) {
                markers.push(marker)
            }
        }

        const projectType = detectProjectTypeFromMarkers(markers)
        let frameworks: string[] = []
        let packageJson: any = null

        if (projectType?.id === 'node' && lowerEntryNames.has('package.json')) {
            try {
                const packageJsonContent = await readFile(join(directoryPath, 'package.json'), 'utf-8')
                packageJson = JSON.parse(packageJsonContent)
                frameworks = detectFrameworksFromPackageJson(packageJson, entryNames).map((framework) => framework.id)
            } catch (error) {
                log.warn(`[FileIndex] Failed to parse package.json in ${directoryPath}`, error)
            }
        }

        const projectIconPath = markers.length > 0
            ? await resolveProjectIconPath(directoryPath, entryNames, packageJson)
            : null

        return {
            markers,
            frameworks,
            projectType: projectType ?? null,
            projectIconPath
        }
    }

    private async insertFileEntry(
        rootPath: string,
        parentPath: string,
        filePath: string,
        fileStats: Awaited<ReturnType<typeof stat>>,
        insertStatement: Statement,
        depth: number
    ): Promise<void> {
        const name = resolveEntryName(filePath)
        const extension = getFileExtension(name)
        this.insertEntry({
            rootPath,
            parentPath,
            targetPath: filePath,
            type: 'file',
            extension,
            size: Number(fileStats.size),
            lastModified: Number(fileStats.mtimeMs),
            isHidden: name.startsWith('.'),
            isProject: false,
            projectType: null,
            projectIconPath: null,
            markers: [],
            frameworks: [],
            depth
        }, insertStatement)
    }

    private insertEntry(
        input: {
            rootPath: string
            parentPath: string | null
            targetPath: string
            type: 'file' | 'directory'
            extension: string
            size?: number
            lastModified?: number
            isHidden: boolean
            isProject: boolean
            projectType: string | null
            projectIconPath: string | null
            markers: string[]
            frameworks: string[]
            depth: number
        },
        insertStatement: Statement
    ): void {
        const relativePath = toRelativePath(input.rootPath, input.targetPath)
        const name = resolveEntryName(input.targetPath)
        insertStatement.run([
            input.targetPath,
            normalizePathKey(input.targetPath),
            input.rootPath,
            normalizePathKey(input.rootPath),
            input.parentPath,
            input.parentPath ? normalizePathKey(input.parentPath) : null,
            relativePath,
            relativePath.toLowerCase(),
            name,
            name.toLowerCase(),
            input.type,
            input.extension.toLowerCase(),
            toNullableNumber(input.size),
            toNullableNumber(input.lastModified),
            sqlBool(input.isHidden),
            sqlBool(input.isProject),
            input.projectType,
            input.projectIconPath,
            jsonStringify(input.markers),
            jsonStringify(input.frameworks),
            input.depth
        ])
    }

    private readFolderIndexSummary(
        roots: string[],
        errors: Array<{ folder: string; error: string }>
    ): FileIndexFoldersResult {
        const db = this.requireDb()
        const rootPlaceholders = roots.map(() => '?').join(', ')
        const rootArgs = roots
        if (roots.length === 0) {
            return {
                success: errors.length === 0,
                projects: [],
                totalFolders: 0,
                indexedFolders: 0,
                indexedFiles: 0,
                scannedFolderPaths: [],
                indexedCount: 0,
                errors: errors.length > 0 ? errors : undefined
            }
        }

        const projectRows = db.exec(`
            SELECT
                name,
                path,
                project_type,
                project_icon_path,
                markers_json,
                frameworks_json,
                last_modified,
                root_path,
                depth
            FROM file_index_entries
            WHERE root_path IN (${rootPlaceholders}) AND is_project = 1 AND type = 'directory'
            ORDER BY COALESCE(last_modified, 0) DESC, name ASC
        `, rootArgs)[0]?.values || []

        const projects = projectRows.map((row) => ({
            name: String(row[0] || ''),
            path: String(row[1] || ''),
            type: typeof row[2] === 'string' && row[2].length > 0 ? row[2] : 'unknown',
            projectIconPath: typeof row[3] === 'string' && row[3].length > 0 ? row[3] : null,
            markers: parseJsonArray(row[4]),
            frameworks: parseJsonArray(row[5]),
            lastModified: typeof row[6] === 'number' ? row[6] : undefined,
            isProject: true,
            sourceFolder: String(row[7] || ''),
            depth: typeof row[8] === 'number' ? row[8] : 0
        })) satisfies DevScopeIndexedProject[]

        const totalsRows = db.exec(`
            SELECT
                SUM(CASE WHEN type = 'directory' THEN 1 ELSE 0 END),
                SUM(CASE WHEN type = 'file' THEN 1 ELSE 0 END)
            FROM file_index_entries
            WHERE root_path IN (${rootPlaceholders})
        `, rootArgs)[0]?.values?.[0] || []

        const folderRows = db.exec(`
            SELECT path
            FROM file_index_entries
            WHERE root_path IN (${rootPlaceholders}) AND type = 'directory'
            ORDER BY path ASC
        `, rootArgs)[0]?.values || []

        return {
            success: errors.length === 0 || projects.length > 0,
            projects,
            totalFolders: roots.length,
            indexedFolders: typeof totalsRows[0] === 'number' ? totalsRows[0] : 0,
            indexedFiles: typeof totalsRows[1] === 'number' ? totalsRows[1] : 0,
            scannedFolderPaths: folderRows
                .map((row) => String(row[0] || ''))
                .filter(Boolean),
            indexedCount: projects.length,
            errors: errors.length > 0 ? errors : undefined
        }
    }

    private searchPathsInternal(input: DevScopeIndexedPathSearchInput): DevScopeIndexedPathSearchResult {
        const db = this.requireDb()
        const limit = Math.max(1, Math.min(Number(input.limit) || 50, 500))
        const term = String(input.term || '').trim().toLowerCase()
        const extensionFilters = Array.from(new Set(
            (input.extensionFilters || [])
                .map((extension) => String(extension || '').trim().replace(/^\./, '').toLowerCase())
                .filter(Boolean)
        ))

        const scopeFilters: string[] = []
        const args: Array<string | number> = []
        const scopePath = String(input.scopePath || '').trim()
        const roots = Array.from(new Set(
            (input.roots || [])
                .map((root) => String(root || '').trim())
                .filter(Boolean)
        ))

        if (scopePath) {
            const normalizedScope = normalizePathKey(scopePath)
            scopeFilters.push('(normalized_path = ? OR normalized_path LIKE ?)')
            args.push(normalizedScope, `${normalizedScope}/%`)
        } else if (roots.length > 0) {
            for (const root of roots) {
                const normalizedRoot = normalizePathKey(root)
                scopeFilters.push('(normalized_root_path = ?)')
                args.push(normalizedRoot)
            }
        }

        const includeFiles = input.includeFiles ?? true
        const includeDirectories = input.includeDirectories ?? true
        const showHidden = input.showHidden ?? false
        const candidateLimit = Math.max(limit * FILE_INDEX_SEARCH_FALLBACK_MULTIPLIER, limit)
        const baseFilters = [
            scopeFilters.length > 0 ? `(${scopeFilters.join(' OR ')})` : '',
            includeFiles && includeDirectories
                ? ''
                : includeFiles
                    ? `type = 'file'`
                    : `type = 'directory'`,
            showHidden ? '' : 'is_hidden = 0',
            extensionFilters.length > 0
                ? `extension IN (${extensionFilters.map(() => '?').join(', ')})`
                : ''
        ].filter(Boolean)
        if (extensionFilters.length > 0) {
            args.push(...extensionFilters)
        }

        const selectColumns = `
            SELECT
                path,
                root_path,
                parent_path,
                relative_path,
                name,
                type,
                extension,
                size,
                last_modified,
                is_hidden,
                is_project,
                project_type,
                project_icon_path,
                markers_json,
                frameworks_json,
                depth
            FROM file_index_entries
        `

        const prefixMatches = term
            ? db.exec(`
                ${selectColumns}
                WHERE ${[...baseFilters, '(name_lower LIKE ? ESCAPE \'\\\' OR relative_path_lower LIKE ? ESCAPE \'\\\')'].join(' AND ')}
                ORDER BY CASE WHEN name_lower = ? THEN 0 WHEN name_lower LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, depth ASC, name ASC
                LIMIT ?
            `, [
                ...args,
                `${escapeLikeValue(term)}%`,
                `${escapeLikeValue(term)}%`,
                term,
                `${escapeLikeValue(term)}%`,
                candidateLimit
            ])[0]?.values || []
            : []

        const seenPaths = new Set(prefixMatches.map((row) => String(row[0] || '')))
        const containsMatches = term
            ? db.exec(`
                ${selectColumns}
                WHERE ${[...baseFilters, '(name_lower LIKE ? ESCAPE \'\\\' OR relative_path_lower LIKE ? ESCAPE \'\\\')'].join(' AND ')}
                ORDER BY depth ASC, name ASC
                LIMIT ?
            `, [
                ...args,
                `%${escapeLikeValue(term)}%`,
                `%${escapeLikeValue(term)}%`,
                candidateLimit
            ])[0]?.values || []
            : db.exec(`
                ${selectColumns}
                WHERE ${baseFilters.length > 0 ? baseFilters.join(' AND ') : '1 = 1'}
                ORDER BY depth ASC, name ASC
                LIMIT ?
            `, [...args, candidateLimit])[0]?.values || []

        const combinedRows = [...prefixMatches]
        for (const row of containsMatches) {
            const pathValue = String(row[0] || '')
            if (!pathValue || seenPaths.has(pathValue)) continue
            seenPaths.add(pathValue)
            combinedRows.push(row)
        }

        const scoredEntries = combinedRows
            .map((row) => {
                const entry = mapIndexedEntry(row)
                if (scopePath && normalizePathKey(entry.path) === normalizePathKey(scopePath)) {
                    return null
                }
                return {
                    entry,
                    score: scoreIndexedEntry(entry, term)
                }
            })
            .filter((item): item is { entry: DevScopeIndexedPathEntry; score: number } => Boolean(item))
            .sort((left, right) => right.score - left.score || left.entry.depth - right.entry.depth || left.entry.name.localeCompare(right.entry.name))
            .slice(0, limit)

        const entries = scoredEntries.map((item) => item.entry)
        const ancestorPaths = new Set<string>()
        for (const entry of entries) {
            let parentPath = entry.parentPath
            while (parentPath) {
                if (scopePath && !isPathWithinScope(parentPath, scopePath)) break
                if (ancestorPaths.has(parentPath)) {
                    parentPath = null
                    continue
                }
                ancestorPaths.add(parentPath)
                const ancestorRow = db.exec(`
                    ${selectColumns}
                    WHERE normalized_path = ?
                    LIMIT 1
                `, [normalizePathKey(parentPath)])[0]?.values?.[0]
                if (!ancestorRow) break
                parentPath = typeof ancestorRow[2] === 'string' && ancestorRow[2].length > 0 ? ancestorRow[2] : null
            }
        }

        const ancestors = Array.from(ancestorPaths)
            .map((pathValue) => db.exec(`
                ${selectColumns}
                WHERE normalized_path = ?
                LIMIT 1
            `, [normalizePathKey(pathValue)])[0]?.values?.[0] || null)
            .filter((row): row is SqlValue[] => Array.isArray(row))
            .map((row) => mapIndexedEntry(row))
            .filter((entry) => !scopePath || normalizePathKey(entry.path) !== normalizePathKey(scopePath))
            .sort((left, right) => left.depth - right.depth || left.name.localeCompare(right.name))

        return {
            entries,
            ancestors,
            totalMatched: scoredEntries.length
        }
    }

    private readIndexedRoots(): FileIndexRootRow[] {
        const rows = this.requireDb().exec(`
            SELECT root_path, normalized_root_path, last_indexed_at
            FROM file_index_roots
            ORDER BY root_path ASC
        `)[0]?.values || []

        return rows.map((row) => ({
            rootPath: String(row[0] || ''),
            normalizedRootPath: String(row[1] || ''),
            lastIndexedAt: typeof row[2] === 'number' ? row[2] : 0
        }))
    }

    private findCoveringRoot(pathValue: string): FileIndexRootRow | null {
        const normalizedPath = normalizePathKey(pathValue)
        const roots = this.readIndexedRoots()
            .filter((row) => normalizedPath === row.normalizedRootPath || normalizedPath.startsWith(`${row.normalizedRootPath}/`))
            .sort((left, right) => right.normalizedRootPath.length - left.normalizedRootPath.length)
        return roots[0] || null
    }

    private scheduleFlush(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer)
        }
        this.writeTimer = setTimeout(() => {
            this.writeTimer = null
            void this.enqueue(async () => {
                await this.flushNow()
            })
        }, FILE_INDEX_FLUSH_DEBOUNCE_MS)
        this.writeTimer.unref?.()
    }

    private async flushNow(): Promise<void> {
        const db = this.requireDb()
        const bytes = Buffer.from(db.export())
        await writeFile(this.filePath, bytes)
    }

    private enqueue<T>(work: () => T | Promise<T>): Promise<T> {
        const nextOperation = this.operationQueue.then(work)
        this.operationQueue = nextOperation.then(() => undefined, () => undefined)
        return nextOperation
    }

    private requireDb(): SqlDatabase {
        if (!this.db) {
            throw new Error('File index database is not initialized.')
        }
        return this.db
    }
}

function getFileExtension(fileName: string): string {
    const normalized = String(fileName || '').toLowerCase()
    if (!normalized) return ''
    if (normalized.startsWith('.') && normalized.indexOf('.', 1) === -1) {
        return normalized.slice(1)
    }
    const dotIndex = normalized.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === normalized.length - 1) return ''
    return normalized.slice(dotIndex + 1)
}

function depthFromRoot(rootPath: string, targetPath: string): number {
    return toRelativePath(rootPath, targetPath).split('/').filter(Boolean).length
}

function scoreIndexedEntry(entry: DevScopeIndexedPathEntry, term: string): number {
    if (!term) {
        return entry.type === 'directory' ? 20 - entry.depth : 10 - entry.depth
    }

    const nameLower = entry.name.toLowerCase()
    const relativeLower = entry.relativePath.toLowerCase()
    let score = 0
    if (nameLower === term) score += 120
    if (nameLower.startsWith(term)) score += 90
    if (relativeLower.startsWith(term)) score += 70
    if (nameLower.includes(term)) score += 50
    if (relativeLower.includes(term)) score += 30
    if (entry.type === 'directory') score += 5
    score -= entry.depth
    return score
}

const fileIndexService = new FileIndexService()

export async function indexFilesAcrossFolders(folders: string[]): Promise<FileIndexFoldersResult> {
    return await fileIndexService.indexFolders(folders)
}

export async function searchIndexedPaths(
    input: DevScopeIndexedPathSearchInput
): Promise<DevScopeIndexedPathSearchResult> {
    return await fileIndexService.searchPaths(input)
}

export function scheduleFileIndexRefresh(pathValue: string): void {
    fileIndexService.scheduleRefreshPath(pathValue)
}
