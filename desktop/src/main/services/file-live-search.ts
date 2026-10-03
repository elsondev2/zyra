import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import type { DevScopeIndexedPathEntry, DevScopeIndexedPathSearchInput, DevScopeIndexedPathSearchResult } from '../../shared/contracts/devscope-project-contracts'
import { detectProjectTypeFromMarkers, PROJECT_MARKERS } from '../ipc/project-detection'

const MAX_ENTRIES = 300_000
const MAX_CACHED_ROOTS = 4
const CACHE_TTL_MS = 30_000
const PAUSE_EVERY_ENTRIES = 64
const PAUSE_MS = 8
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '__pycache__', '.venv', 'venv', '.next', '.nuxt', '.turbo', '.cache', 'coverage', 'out'])

type Inventory = { expiresAt: number; promise: Promise<DevScopeIndexedPathEntry[]> }
const inventories = new Map<string, Inventory>()

function pathKey(pathValue: string): string {
    const normalized = resolve(pathValue).replace(/\\/g, '/')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function pause(): Promise<void> {
    return new Promise(resolvePause => setTimeout(resolvePause, PAUSE_MS))
}

function markersFor(names: string[]): string[] {
    const lowerNames = new Set(names.map(name => name.toLowerCase()))
    return PROJECT_MARKERS.filter(marker => marker.startsWith('*')
        ? names.some(name => name.toLowerCase().endsWith(marker.slice(1).toLowerCase()))
        : lowerNames.has(marker.toLowerCase()))
}

async function scanRoot(rootPath: string, maxDepth = 32): Promise<DevScopeIndexedPathEntry[]> {
    const entries: DevScopeIndexedPathEntry[] = []
    const stack: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]
    let visited = 0
    while (stack.length > 0 && entries.length < MAX_ENTRIES) {
        const current = stack.pop()!
        if (current.depth > maxDepth) continue
        let children: Dirent[]
        try {
            children = await readdir(current.path, { withFileTypes: true })
        } catch {
            continue
        }
        const markers = markersFor(children.map(child => child.name))
        if (current.depth > 0) {
            const projectType = detectProjectTypeFromMarkers(markers)
            entries.push({
                path: current.path, rootPath, parentPath: dirname(current.path),
                relativePath: relative(rootPath, current.path).replace(/\\/g, '/'),
                name: basename(current.path), type: 'directory', extension: '',
                isHidden: basename(current.path).startsWith('.'), isProject: markers.length > 0,
                projectType: projectType?.id || null, markers, frameworks: [], depth: current.depth
            })
        }
        for (const child of children) {
            if (entries.length >= MAX_ENTRIES) break
            if (child.isSymbolicLink()) continue
            const childPath = join(current.path, child.name)
            if (child.isDirectory()) {
                if (!SKIP_DIRECTORIES.has(child.name.toLowerCase())) stack.push({ path: childPath, depth: current.depth + 1 })
            } else if (child.isFile()) {
                const dot = child.name.lastIndexOf('.')
                const extension = dot === 0 && child.name.indexOf('.', 1) === -1
                    ? child.name.slice(1).toLowerCase()
                    : dot > 0 ? child.name.slice(dot + 1).toLowerCase() : ''
                entries.push({
                    path: childPath, rootPath, parentPath: current.path,
                    relativePath: relative(rootPath, childPath).replace(/\\/g, '/'),
                    name: child.name, type: 'file', extension,
                    isHidden: child.name.startsWith('.'), isProject: false,
                    markers: [], frameworks: [], depth: current.depth + 1
                })
            }
            if (++visited % PAUSE_EVERY_ENTRIES === 0) await pause()
        }
    }
    return entries
}

function inventoryFor(rootPath: string): Promise<DevScopeIndexedPathEntry[]> {
    const key = pathKey(rootPath)
    const cached = inventories.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.promise
    const entry: Inventory = { expiresAt: Number.POSITIVE_INFINITY, promise: Promise.resolve([]) }
    const promise = scanRoot(rootPath).then(result => {
        entry.expiresAt = Date.now() + CACHE_TTL_MS
        return result
    }).catch(error => { inventories.delete(key); throw error })
    entry.promise = promise
    inventories.delete(key)
    inventories.set(key, entry)
    while (inventories.size > MAX_CACHED_ROOTS) inventories.delete(inventories.keys().next().value!)
    return promise
}

export function invalidateLivePathSearch(): void {
    inventories.clear()
}

function score(entry: DevScopeIndexedPathEntry, term: string): number {
    const name = entry.name.toLowerCase()
    const path = entry.relativePath.toLowerCase()
    return (name === term ? 120 : 0)
        + (name.startsWith(term) ? 90 : 0)
        + (path.startsWith(term) ? 70 : 0)
        + (name.includes(term) ? 50 : 0)
        + (path.includes(term) ? 30 : 0)
        + (entry.type === 'directory' ? 5 : 0) - entry.depth
}

export async function searchLivePaths(input: DevScopeIndexedPathSearchInput, roots: string[]): Promise<DevScopeIndexedPathSearchResult> {
    const limit = Math.max(1, Math.min(Number(input.limit) || 50, 500))
    const term = String(input.term || '').trim().toLowerCase()
    const scope = input.scopePath ? pathKey(input.scopePath) : ''
    const extensions = new Set((input.extensionFilters || []).map(extension => extension.replace(/^\./, '').toLowerCase()))
    const matches: DevScopeIndexedPathEntry[] = []
    const allEntries = new Map<string, DevScopeIndexedPathEntry>()
    for (const root of roots) {
        for (const entry of await (term ? inventoryFor(root) : scanRoot(root, 1))) {
            allEntries.set(pathKey(entry.path), entry)
            const entryKey = pathKey(entry.path)
            if (scope && entryKey !== scope && !entryKey.startsWith(`${scope}/`)) continue
            if (!input.showHidden && entry.relativePath.split('/').some(segment => segment.startsWith('.'))) continue
            if (entry.type === 'file' && input.includeFiles === false) continue
            if (entry.type === 'directory' && input.includeDirectories === false) continue
            if (extensions.size > 0 && !extensions.has(entry.extension)) continue
            if (term && !entry.name.toLowerCase().includes(term) && !entry.relativePath.toLowerCase().includes(term)) continue
            matches.push(entry)
        }
    }
    matches.sort((left, right) => score(right, term) - score(left, term) || left.depth - right.depth || left.name.localeCompare(right.name))
    const selected = matches.slice(0, limit)
    const ancestors = new Map<string, DevScopeIndexedPathEntry>()
    if (input.includeAncestors !== false) {
        for (const entry of selected) {
            let parent = entry.parentPath
            while (parent && (!scope || pathKey(parent).startsWith(`${scope}/`))) {
                const parentKey = pathKey(parent)
                const ancestor = allEntries.get(parentKey)
                if (!ancestor || ancestors.has(parentKey)) break
                ancestors.set(parentKey, ancestor)
                parent = ancestor.parentPath
            }
        }
    }
    return { entries: selected, ancestors: [...ancestors.values()].sort((a, b) => a.depth - b.depth), totalMatched: matches.length }
}
