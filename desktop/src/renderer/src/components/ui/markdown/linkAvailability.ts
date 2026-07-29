import { resolveMarkdownLinkTarget } from './linkNavigation'
import {
    findExactIndexedPathMatches,
    indexedPathBasename,
    resetIndexedProjectPathCache,
    searchIndexedProjectPaths
} from './projectPathIndex'

export type MarkdownLinkAvailability = 'available' | 'missing' | 'unknown'

export type MarkdownLinkAvailabilityResult = {
    availability: MarkdownLinkAvailability
    path: string
    resolvedBy: 'direct' | 'project-search'
    targetKind: 'file' | 'directory' | null
}

type AvailabilityCacheEntry = {
    expiresAt: number
    promise: Promise<MarkdownLinkAvailabilityResult>
}

const MAX_AVAILABILITY_ENTRIES = 400
const AVAILABLE_TTL_MS = 30_000
const MISSING_TTL_MS = 5_000
const UNKNOWN_TTL_MS = 1_500
const availabilityCache = new Map<string, AvailabilityCacheEntry>()

function normalizePathKey(pathValue: string): string {
    return String(pathValue || '').trim().replace(/\\/g, '/').toLowerCase()
}

function getParentPath(pathValue: string | undefined): string {
    const value = String(pathValue || '').trim()
    const separatorIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
    return separatorIndex > 0 ? value.slice(0, separatorIndex) : ''
}

function isProjectRelativeHref(href: string): boolean {
    const pathname = String(href || '').trim().split('#', 1)[0]?.split('?', 1)[0] || ''
    if (!pathname || /^[a-z][a-z0-9+.-]*:/i.test(pathname)) return false
    if (/^[a-zA-Z]:[\\/]/.test(pathname) || pathname.startsWith('/') || pathname.startsWith('\\\\')) return false
    return true
}

function retainAvailabilityEntry(key: string, entry: AvailabilityCacheEntry): void {
    availabilityCache.delete(key)
    availabilityCache.set(key, entry)
    while (availabilityCache.size > MAX_AVAILABILITY_ENTRIES) {
        const oldestKey = availabilityCache.keys().next().value as string | undefined
        if (!oldestKey) break
        availabilityCache.delete(oldestKey)
    }
}

async function resolveProjectShorthand(
    targetPath: string,
    projectRoot: string
): Promise<{ state: 'found'; path: string; targetKind: 'file' | 'directory' | null } | { state: 'missing' | 'ambiguous' | 'unknown' }> {
    const snapshot = await searchIndexedProjectPaths(projectRoot, indexedPathBasename(targetPath))
    if (!snapshot) return { state: 'unknown' }
    const matches = findExactIndexedPathMatches(snapshot, targetPath, projectRoot)
    if (matches.length === 0) return { state: 'missing' }
    if (matches.length > 1) return { state: 'ambiguous' }
    const match = matches[0]!
    const pathInfo = await window.devscope.getPathInfo(match.path).catch(() => null)
    if (!pathInfo?.success) return { state: 'unknown' }
    return pathInfo.exists
        ? { state: 'found', path: pathInfo.path, targetKind: pathInfo.type }
        : { state: 'missing' }
}

export async function inspectMarkdownLinkAvailability(
    href: string,
    filePath?: string,
    searchRootPath?: string
): Promise<MarkdownLinkAvailabilityResult | null> {
    const target = resolveMarkdownLinkTarget(href, filePath)
    if (!target) return null

    const projectRoot = String(searchRootPath || getParentPath(filePath)).trim()
    const key = `${normalizePathKey(projectRoot)}|${normalizePathKey(target.path)}`
    const now = Date.now()
    const cached = availabilityCache.get(key)
    if (cached && cached.expiresAt > now) {
        retainAvailabilityEntry(key, cached)
        return cached.promise
    }

    const entry: AvailabilityCacheEntry = {
        expiresAt: now + UNKNOWN_TTL_MS,
        promise: Promise.resolve({
            availability: 'unknown' as const,
            path: target.path,
            resolvedBy: 'direct' as const,
            targetKind: null
        })
    }
    entry.promise = Promise.resolve()
        .then(async (): Promise<MarkdownLinkAvailabilityResult> => {
            const pathInfo = await window.devscope.getPathInfo(target.path).catch(() => null)
            if (pathInfo?.success && pathInfo.exists) {
                return {
                    availability: 'available',
                    path: pathInfo.path,
                    resolvedBy: 'direct',
                    targetKind: pathInfo.type
                }
            }

            if (projectRoot && isProjectRelativeHref(href)) {
                const projectMatch = await resolveProjectShorthand(target.path, projectRoot)
                if (projectMatch.state === 'found') {
                    return {
                        availability: 'available',
                        path: projectMatch.path,
                        resolvedBy: 'project-search',
                        targetKind: projectMatch.targetKind
                    }
                }
                if (projectMatch.state === 'ambiguous' || projectMatch.state === 'unknown') {
                    return {
                        availability: 'unknown',
                        path: target.path,
                        resolvedBy: 'direct',
                        targetKind: null
                    }
                }
            }

            return {
                availability: pathInfo?.success ? 'missing' : 'unknown',
                path: pathInfo?.success ? pathInfo.path : target.path,
                resolvedBy: 'direct',
                targetKind: null
            }
        })
        .then((result) => {
            entry.expiresAt = Date.now() + (
                result.availability === 'available'
                    ? AVAILABLE_TTL_MS
                    : result.availability === 'missing'
                        ? MISSING_TTL_MS
                        : UNKNOWN_TTL_MS
            )
            return result
        })
        .catch(() => {
            entry.expiresAt = Date.now() + UNKNOWN_TTL_MS
            return {
                availability: 'unknown',
                path: target.path,
                resolvedBy: 'direct',
                targetKind: null
            }
        })
    retainAvailabilityEntry(key, entry)
    return entry.promise
}

export function forgetMarkdownLinkAvailability(pathValue: string): void {
    const pathKey = normalizePathKey(pathValue)
    for (const key of availabilityCache.keys()) {
        if (key.endsWith(`|${pathKey}`)) availabilityCache.delete(key)
    }
}

export function resetMarkdownLinkAvailabilityCache(): void {
    availabilityCache.clear()
    resetIndexedProjectPathCache()
}
