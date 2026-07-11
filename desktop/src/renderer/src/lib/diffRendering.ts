import { parsePatchFiles } from '@pierre/diffs'
import type { FileDiffMetadata, ParsedPatch } from '@pierre/diffs/react'
import type { Theme } from '@/lib/settings'

export interface FileDiffSummary {
    path: string
    previousPath?: string
    additions: number
    deletions: number
    totalLines: number
    fileDiff?: FileDiffMetadata | null
}

export interface ParsedPatchRenderResult {
    patch: string
    metadata: string
    parsedPatches: ParsedPatch[]
    files: FileDiffMetadata[]
    error: string | null
}

const EMPTY_DIFF_MARKERS = new Set(['', 'No changes', 'No diff available'])
const PARSED_PATCH_RENDER_CACHE_LIMIT = 40
const parsedPatchRenderCache = new Map<string, ParsedPatchRenderResult>()
const scannedPatchSummaryCache = new Map<string, PatchFileScanResult[]>()

interface PatchFileScanResult {
    path: string
    previousPath?: string
    additions: number
    deletions: number
    totalLines: number
    startLine: number
    endLine: number
}

export function resolveDiffThemeType(theme: Theme): 'light' | 'dark' {
    return theme === 'light' ? 'light' : 'dark'
}

export function resolveDiffThemeName(theme: Theme): 'pierre-light' | 'pierre-dark' {
    return resolveDiffThemeType(theme) === 'light' ? 'pierre-light' : 'pierre-dark'
}

function fnv1a32(value: string): string {
    let hash = 0x811c9dc5

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }

    return (hash >>> 0).toString(16)
}

export function buildPatchCacheKey(scope: string, patch: string): string {
    return `${scope}:${fnv1a32(patch)}`
}

function readParsedPatchRenderCache(cacheKey: string): ParsedPatchRenderResult | null {
    const cached = parsedPatchRenderCache.get(cacheKey)
    if (!cached) return null

    parsedPatchRenderCache.delete(cacheKey)
    parsedPatchRenderCache.set(cacheKey, cached)
    return cached
}

function writeParsedPatchRenderCache(cacheKey: string, value: ParsedPatchRenderResult): void {
    parsedPatchRenderCache.set(cacheKey, value)
    while (parsedPatchRenderCache.size > PARSED_PATCH_RENDER_CACHE_LIMIT) {
        const oldestKey = parsedPatchRenderCache.keys().next().value
        if (!oldestKey) break
        parsedPatchRenderCache.delete(oldestKey)
    }
}

function readScannedPatchSummaryCache(cacheKey: string): PatchFileScanResult[] | null {
    const cached = scannedPatchSummaryCache.get(cacheKey)
    if (!cached) return null

    scannedPatchSummaryCache.delete(cacheKey)
    scannedPatchSummaryCache.set(cacheKey, cached)
    return cached
}

function writeScannedPatchSummaryCache(cacheKey: string, value: PatchFileScanResult[]): void {
    scannedPatchSummaryCache.set(cacheKey, value)
    while (scannedPatchSummaryCache.size > PARSED_PATCH_RENDER_CACHE_LIMIT) {
        const oldestKey = scannedPatchSummaryCache.keys().next().value
        if (!oldestKey) break
        scannedPatchSummaryCache.delete(oldestKey)
    }
}

export function normalizePatchText(patch: string): string {
    const normalized = patch.replace(/\r\n/g, '\n').trim()
    return EMPTY_DIFF_MARKERS.has(normalized) ? '' : normalized
}

export function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
    return (fileDiff.name || fileDiff.prevName || '').replace(/\\/g, '/')
}

function decodeQuotedPatchPath(value: string): string {
    const trimmed = value.trim()
    if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed
    }

    return trimmed
        .slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
}

function normalizePatchPath(value: string): string {
    const decoded = decodeQuotedPatchPath(value)
    if (!decoded || decoded === '/dev/null') return ''

    if (decoded.startsWith('a/') || decoded.startsWith('b/')) {
        return decoded.slice(2).replace(/\\/g, '/')
    }

    return decoded.replace(/\\/g, '/')
}

function splitGitDiffTargets(line: string): [string, string] | null {
    const source = line.replace(/^diff --git\s+/, '')
    const tokens: string[] = []
    let index = 0

    while (index < source.length && tokens.length < 2) {
        while (source[index] === ' ') index += 1
        if (index >= source.length) break

        if (source[index] === '"') {
            let token = '"'
            index += 1

            while (index < source.length) {
                const character = source[index]
                token += character
                index += 1
                if (character === '"' && source[index - 2] !== '\\') break
            }

            tokens.push(token)
            continue
        }

        const start = index
        while (index < source.length && source[index] !== ' ') index += 1
        tokens.push(source.slice(start, index))
    }

    return tokens.length === 2 ? [tokens[0], tokens[1]] : null
}

function collectPatchFileScanResults(normalizedPatch: string): PatchFileScanResult[] {
    if (!normalizedPatch) return []

    const cacheKey = buildPatchCacheKey('scan', normalizedPatch)
    const cached = readScannedPatchSummaryCache(cacheKey)
    if (cached) return cached

    const lines = normalizedPatch.split('\n')
    const results: PatchFileScanResult[] = []
    let current: {
        startLine: number
        additions: number
        deletions: number
        previousPath?: string
        nextPath?: string
        headerPreviousPath?: string
        headerNextPath?: string
        inHunk: boolean
    } | null = null

    const flushCurrent = (endLine: number) => {
        if (!current) return

        const path = current.nextPath || current.headerNextPath || current.previousPath || current.headerPreviousPath || ''
        if (path) {
            const previousPath = current.previousPath || current.headerPreviousPath
            results.push({
                path,
                previousPath: previousPath && previousPath !== path ? previousPath : undefined,
                additions: current.additions,
                deletions: current.deletions,
                totalLines: current.additions + current.deletions,
                startLine: current.startLine,
                endLine
            })
        }

        current = null
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]

        if (line.startsWith('diff --git ')) {
            flushCurrent(index)

            const pair = splitGitDiffTargets(line)
            current = {
                startLine: index,
                additions: 0,
                deletions: 0,
                headerPreviousPath: pair ? normalizePatchPath(pair[0]) : undefined,
                headerNextPath: pair ? normalizePatchPath(pair[1]) : undefined,
                inHunk: false
            }
            continue
        }

        if (!current) continue

        if (line.startsWith('rename from ')) {
            current.previousPath = normalizePatchPath(line.slice('rename from '.length))
            continue
        }

        if (line.startsWith('rename to ')) {
            current.nextPath = normalizePatchPath(line.slice('rename to '.length))
            continue
        }

        if (line.startsWith('--- ')) {
            const previousPath = normalizePatchPath(line.slice(4))
            if (previousPath) current.previousPath = previousPath
            continue
        }

        if (line.startsWith('+++ ')) {
            const nextPath = normalizePatchPath(line.slice(4))
            if (nextPath) current.nextPath = nextPath
            continue
        }

        if (line.startsWith('@@')) {
            current.inHunk = true
            continue
        }

        if (!current.inHunk || !line) continue

        if (line[0] === '+') {
            current.additions += 1
            continue
        }

        if (line[0] === '-') {
            current.deletions += 1
        }
    }

    flushCurrent(lines.length)
    writeScannedPatchSummaryCache(cacheKey, results)
    return results
}

export function summarizeFileDiff(fileDiff: FileDiffMetadata): FileDiffSummary {
    const additions = fileDiff.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0)
    const deletions = fileDiff.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0)
    const changedLines = additions + deletions

    return {
        path: resolveFileDiffPath(fileDiff),
        previousPath: fileDiff.prevName?.replace(/\\/g, '/'),
        additions,
        deletions,
        totalLines: changedLines,
        fileDiff
    }
}

export function scanPatchFileSummaries(patch: string): FileDiffSummary[] {
    const normalizedPatch = normalizePatchText(patch)
    if (!normalizedPatch) return []

    return collectPatchFileScanResults(normalizedPatch).map(({ startLine: _startLine, endLine: _endLine, ...summary }) => ({
        ...summary,
        fileDiff: null
    }))
}

export function extractFilePatch(patch: string, targetPath: string, previousPath?: string): string {
    const normalizedPatch = normalizePatchText(patch)
    if (!normalizedPatch) return ''

    const normalizedTargetPath = targetPath.replace(/\\/g, '/')
    const normalizedPreviousPath = previousPath?.replace(/\\/g, '/')
    const lines = normalizedPatch.split('\n')
    const matchingSection = collectPatchFileScanResults(normalizedPatch).find((section) => {
        if (section.path === normalizedTargetPath) return true
        if (normalizedPreviousPath && section.previousPath === normalizedPreviousPath) return true
        return section.previousPath === normalizedTargetPath
    })

    if (!matchingSection) return ''
    return lines.slice(matchingSection.startLine, matchingSection.endLine).join('\n')
}

function patchHasExplicitFileHeaders(normalizedPatch: string): boolean {
    if (!normalizedPatch) return false

    return normalizedPatch.startsWith('diff --git ')
        || normalizedPatch.startsWith('--- ')
        || normalizedPatch.startsWith('Binary files ')
}

function escapePatchPathSegment(value: string): string {
    if (!/\s/.test(value)) return value
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function normalizeRenderablePatchPath(value: string): string {
    return value.replace(/\\/g, '/').trim()
}

export function buildSyntheticSingleFilePatch(
    patch: string,
    filePath: string,
    previousPath?: string,
    options?: { isNew?: boolean }
): string {
    const normalizedPatch = normalizePatchText(patch)
    const normalizedFilePath = normalizeRenderablePatchPath(filePath)
    const normalizedPreviousPath = normalizeRenderablePatchPath(previousPath || filePath)
    if (!normalizedPatch || !normalizedFilePath) return ''

    if (patchHasExplicitFileHeaders(normalizedPatch)) return ''

    const currentPath = escapePatchPathSegment(normalizedFilePath)
    const previousPathValue = escapePatchPathSegment(normalizedPreviousPath)

    return [
        `diff --git a/${previousPathValue} b/${currentPath}`,
        options?.isNew ? 'new file mode 100644' : null,
        `--- ${options?.isNew ? '/dev/null' : `a/${previousPathValue}`}`,
        `+++ b/${currentPath}`,
        normalizedPatch
    ].filter((line): line is string => Boolean(line)).join('\n')
}

export function parsePatchForRendering(patch: string, scope: string): ParsedPatchRenderResult {
    const normalizedPatch = normalizePatchText(patch)
    if (!normalizedPatch) {
        return {
            patch: '',
            metadata: '',
            parsedPatches: [],
            files: [],
            error: null
        }
    }

    const cacheKey = buildPatchCacheKey(`render:${scope}`, normalizedPatch)
    const cached = readParsedPatchRenderCache(cacheKey)
    if (cached) return cached

    try {
        const parsedPatches = parsePatchFiles(normalizedPatch, buildPatchCacheKey(scope, normalizedPatch))
        const result = {
            patch: normalizedPatch,
            metadata: parsedPatches
                .map((entry) => entry.patchMetadata?.trim())
                .filter((value): value is string => Boolean(value))
                .join('\n\n'),
            parsedPatches,
            files: parsedPatches.flatMap((entry) => entry.files),
            error: null
        }
        writeParsedPatchRenderCache(cacheKey, result)
        return result
    } catch (error) {
        const result = {
            patch: normalizedPatch,
            metadata: '',
            parsedPatches: [],
            files: [],
            error: error instanceof Error ? error.message : 'Unable to parse diff'
        }
        writeParsedPatchRenderCache(cacheKey, result)
        return result
    }
}
