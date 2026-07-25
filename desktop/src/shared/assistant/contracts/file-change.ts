export type FileChangeSource =
    | 'args-preview'
    | 'provider-live'
    | 'provider-result'
    | 'turn-final'
    | 'synthetic-snapshot'

export type FileChangeProvider = 'codex' | 'pi'
export type FileChangeStatus = 'running' | 'completed' | 'failed'
export type FileChangeKind = 'add' | 'delete' | 'update' | 'move'

export interface NormalizedFileChange {
    path: string
    previousPath?: string
    kind: FileChangeKind
    diff?: string
    isNew?: boolean
}

export interface NormalizedFileChangePayload {
    category: 'file-change'
    provider: FileChangeProvider
    status: FileChangeStatus
    toolName?: string
    itemId?: string
    toolCallId?: string
    revision: number
    source: FileChangeSource
    authoritative: boolean
    changes: NormalizedFileChange[]
    paths: string[]
    createdPaths: string[]
    fileCount: number
    patch?: string
    previewPatch?: string
    displayDiff?: string
    additions?: number
    deletions?: number
    startedAt: string
    completedAt?: string
    durationMs?: number
    output?: string
    errorMessage?: string
    truncated?: boolean
    diffUnavailableReason?: 'binary' | 'too-large' | 'snapshot-failed' | 'preview-only'
    snapshotBacked?: boolean
}

export const FILE_CHANGE_MAX_PATCH_BYTES = 512 * 1024
export const FILE_CHANGE_MAX_PATCH_LINES = 12_000

const SOURCE_RANK: Record<FileChangeSource, number> = {
    'args-preview': 1,
    'provider-live': 2,
    'synthetic-snapshot': 3,
    'provider-result': 4,
    'turn-final': 4
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

const RAW_FILE_CHANGE_PATCH_KEYS = new Set([
    'patch',
    'diff',
    'unifieddiff',
    'previewpatch',
    'displaydiff'
])

function stripRawFileChangePatchFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripRawFileChangePatchFields)
    const record = asRecord(value)
    if (!record) return value
    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase().replace(/[-_]/g, '')
        if (RAW_FILE_CHANGE_PATCH_KEYS.has(normalizedKey)) continue
        sanitized[key] = stripRawFileChangePatchFields(entry)
    }
    return sanitized
}

export function sanitizeFileChangeRawPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...payload }
    for (const key of ['result', 'partialResult', 'partial_result', 'response']) {
        if (!Object.prototype.hasOwnProperty.call(sanitized, key)) continue
        sanitized[key] = stripRawFileChangePatchFields(sanitized[key])
    }
    return sanitized
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function readStringArray(value: unknown): string[] {
    if (typeof value === 'string') return value.trim() ? [value.trim()] : []
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
        if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : []
        const record = asRecord(entry)
        const path = readString(record?.['path'])
            || readString(record?.['filePath'])
            || readString(record?.['file_path'])
        return path ? [path] : []
    })
}

function readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string' || !value.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

export function normalizeFileChangePath(value: unknown): string {
    return String(value || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
}

function uniquePaths(values: unknown[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        const path = normalizeFileChangePath(value)
        if (!path || path === '/dev/null' || seen.has(path)) continue
        seen.add(path)
        result.push(path)
    }
    return result
}

export function extractFileChangePathsFromPatch(patch: unknown): string[] {
    const text = readString(patch)
    if (!text) return []
    const paths: string[] = []
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const header = /^(?:---|\+\+\+)\s+([^\t]+)(?:\t.*)?$/.exec(line)
        if (header?.[1]) {
            paths.push(header[1].replace(/^[ab]\//, ''))
            continue
        }
        const custom = /^\*\*\* (?:Add|Delete|Update|Move to) File:\s+(.+)$/.exec(line)
        if (custom?.[1]) paths.push(custom[1])
    }
    return uniquePaths(paths)
}

export function getFileChangePatchStats(patch: unknown): { additions: number; deletions: number } {
    const text = readString(patch) || ''
    let additions = 0
    let deletions = 0
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
        if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
    }
    return { additions, deletions }
}

export function boundFileChangeText(
    value: unknown,
    options: { maxBytes?: number; maxLines?: number } = {}
): { text?: string; truncated: boolean } {
    const source = readString(value)
    if (!source) return { text: undefined, truncated: false }
    const maxBytes = Math.max(1024, options.maxBytes ?? FILE_CHANGE_MAX_PATCH_BYTES)
    const maxLines = Math.max(20, options.maxLines ?? FILE_CHANGE_MAX_PATCH_LINES)
    const lines = source.replace(/\r\n/g, '\n').split('\n')
    let text = lines.length > maxLines ? lines.slice(0, maxLines).join('\n') : source
    let truncated = lines.length > maxLines
    const encoder = new TextEncoder()
    if (encoder.encode(text).byteLength > maxBytes) {
        let low = 0
        let high = text.length
        while (low < high) {
            const middle = Math.ceil((low + high) / 2)
            if (encoder.encode(text.slice(0, middle)).byteLength <= maxBytes) low = middle
            else high = middle - 1
        }
        text = text.slice(0, low)
        truncated = true
    }
    if (truncated) text = `${text.replace(/\s+$/, '')}\n… diff truncated by Zyra …`
    return { text, truncated }
}

function normalizeStatus(value: unknown, fallback: FileChangeStatus = 'running'): FileChangeStatus {
    const status = String(value || '').trim().toLowerCase().replace(/[-_\s]/g, '')
    if (['completed', 'complete', 'success', 'succeeded', 'done'].includes(status)) return 'completed'
    if (['failed', 'error', 'cancelled', 'canceled', 'declined', 'aborted', 'stopped'].includes(status)) return 'failed'
    if (['running', 'inprogress', 'pending', 'started', 'streaming'].includes(status)) return 'running'
    return fallback
}

function normalizeSource(value: unknown, fallback: FileChangeSource): FileChangeSource {
    return value === 'args-preview'
        || value === 'provider-live'
        || value === 'provider-result'
        || value === 'turn-final'
        || value === 'synthetic-snapshot'
        ? value
        : fallback
}

function normalizeProvider(value: unknown, fallback: FileChangeProvider): FileChangeProvider {
    return value === 'codex' || value === 'pi' ? value : fallback
}

function normalizeKind(value: unknown, previousPath?: string): FileChangeKind {
    const record = asRecord(value)
    const raw = String(record?.['type'] || value || '').trim().toLowerCase()
    if (previousPath || raw === 'move' || raw === 'rename') return 'move'
    if (raw === 'add' || raw === 'create' || raw === 'new') return 'add'
    if (raw === 'delete' || raw === 'remove') return 'delete'
    return 'update'
}

export function normalizeFileChange(value: unknown): NormalizedFileChange | null {
    const record = asRecord(value)
    if (!record) return null
    const kindRecord = asRecord(record['kind'])
    const movePath = normalizeFileChangePath(
        record['movePath']
        || record['move_path']
        || kindRecord?.['movePath']
        || kindRecord?.['move_path']
    )
    const sourcePath = normalizeFileChangePath(record['path'] || record['filePath'] || record['file_path'])
    const explicitPrevious = normalizeFileChangePath(record['previousPath'] || record['previous_path'])
    const previousPath = explicitPrevious || (movePath ? sourcePath : '')
    const path = movePath || sourcePath
    if (!path) return null
    const boundedDiff = boundFileChangeText(record['diff'] || record['patch'] || record['unified_diff'])
    const kind = normalizeKind(kindRecord || record['kind'] || record['type'], previousPath)
    return {
        path,
        previousPath: previousPath || undefined,
        kind,
        diff: boundedDiff.text,
        isNew: readBoolean(record['isNew']) ?? kind === 'add'
    }
}

function normalizeChanges(value: unknown): NormalizedFileChange[] {
    if (!Array.isArray(value)) return []
    return value.map(normalizeFileChange).filter((entry): entry is NormalizedFileChange => Boolean(entry))
}

function stripPatchPrefix(value: string): string {
    return normalizeFileChangePath(value).replace(/^[ab]\//, '')
}

function renderableChangePatch(change: NormalizedFileChange): string | undefined {
    const diff = readString(change.diff)
    if (!diff) return undefined
    if (/^diff --git /m.test(diff)) return diff
    const path = normalizeFileChangePath(change.path)
    const previousPath = normalizeFileChangePath(change.previousPath || change.path)
    if (!path) return diff
    const header = `diff --git a/${previousPath || path} b/${path}`
    if (/^---\s+/m.test(diff) && /^\+\+\+\s+/m.test(diff)) return `${header}\n${diff}`
    const previousHeader = change.kind === 'add' ? '/dev/null' : `a/${previousPath || path}`
    const currentHeader = change.kind === 'delete' ? '/dev/null' : `b/${path}`
    return `${header}\n--- ${previousHeader}\n+++ ${currentHeader}\n${diff}`
}

export function buildPatchFromFileChanges(changes: NormalizedFileChange[]): string | undefined {
    const parts = changes.map(renderableChangePatch).filter((entry): entry is string => Boolean(entry))
    return parts.length > 0 ? parts.join('\n') : undefined
}

export function buildRenderableFileChangePatch(
    patch: unknown,
    changesValue?: unknown,
    fallbackPaths: string[] = []
): string | undefined {
    const rawPatch = readString(patch)
    if (rawPatch && /^diff --git /m.test(rawPatch)) return rawPatch
    const changes = normalizeChanges(changesValue)
    const changesPatch = buildPatchFromFileChanges(changes)
    if (changesPatch) return changesPatch
    if (!rawPatch) return undefined
    if (/^\*\*\* (?:Begin Patch|Add File:|Delete File:|Update File:)/m.test(rawPatch)) return rawPatch

    const lines = rawPatch.replace(/\r\n/g, '\n').split('\n')
    const sections: string[][] = []
    let current: string[] = []
    for (const line of lines) {
        if (line.startsWith('--- ') && current.some((entry) => entry.startsWith('+++ '))) {
            sections.push(current)
            current = []
        }
        current.push(line)
    }
    if (current.length > 0) sections.push(current)
    const rendered = sections.map((section, index) => {
        const previousHeader = section.find((line) => line.startsWith('--- '))?.slice(4).split('\t')[0]?.trim()
        const currentHeader = section.find((line) => line.startsWith('+++ '))?.slice(4).split('\t')[0]?.trim()
        const previousPath = previousHeader && previousHeader !== '/dev/null' ? stripPatchPrefix(previousHeader) : ''
        const currentPath = currentHeader && currentHeader !== '/dev/null' ? stripPatchPrefix(currentHeader) : ''
        const fallbackPath = normalizeFileChangePath(fallbackPaths[index] || fallbackPaths[0])
        const path = currentPath || previousPath || fallbackPath
        if (!path) return section.join('\n')
        return `diff --git a/${previousPath || path} b/${currentPath || path}\n${section.join('\n')}`
    })
    return rendered.join('\n')
}

function changeKey(change: NormalizedFileChange): string {
    return normalizeFileChangePath(change.path || change.previousPath).toLowerCase()
}

function mergeChanges(
    existing: NormalizedFileChange[],
    incoming: NormalizedFileChange[],
    source: FileChangeSource
): NormalizedFileChange[] {
    if (incoming.length === 0) return existing
    if (source === 'provider-live' || (source === 'args-preview' && existing.length === 0)) return incoming
    const represented = new Set(incoming.flatMap((change) => [
        changeKey(change),
        normalizeFileChangePath(change.previousPath).toLowerCase()
    ]).filter(Boolean))
    return [
        ...existing.filter((change) => !represented.has(changeKey(change))
            && !represented.has(normalizeFileChangePath(change.previousPath).toLowerCase())),
        ...incoming
    ]
}

function terminalStatus(existing: FileChangeStatus, incoming: FileChangeStatus): FileChangeStatus {
    if (existing !== 'running') return existing
    return incoming
}

export function normalizeFileChangePayload(
    value: unknown,
    defaults: {
        provider: FileChangeProvider
        source?: FileChangeSource
        status?: FileChangeStatus
        startedAt: string
        revision?: number
    }
): NormalizedFileChangePayload {
    const record = asRecord(value) || {}
    const source = normalizeSource(record['source'], defaults.source || 'args-preview')
    const changes = normalizeChanges(record['changes'])
    const rawPatch = record['patch'] || (source === 'args-preview' ? undefined : buildPatchFromFileChanges(changes))
    const rawPreviewPatch = record['previewPatch'] || record['preview_patch'] || (source === 'args-preview' ? record['patch'] : undefined)
    const boundedPatch = boundFileChangeText(rawPatch)
    const boundedPreview = boundFileChangeText(rawPreviewPatch)
    const boundedDisplay = boundFileChangeText(record['displayDiff'] || record['display_diff'])
    const paths = uniquePaths([
        ...changes.map((change) => change.path),
        ...readStringArray(record['paths']),
        ...extractFileChangePathsFromPatch(boundedPatch.text || boundedPreview.text)
    ])
    const createdPaths = uniquePaths([
        ...changes.filter((change) => change.kind === 'add' || change.isNew).map((change) => change.path),
        ...readStringArray(record['createdPaths'] || record['created_paths'])
    ])
    const patchStats = getFileChangePatchStats(boundedPatch.text || boundedPreview.text)
    const status = normalizeStatus(record['status'], defaults.status || 'running')
    const startedAt = readString(record['startedAt'] || record['started_at']) || defaults.startedAt
    const completedAt = status === 'running'
        ? undefined
        : readString(record['completedAt'] || record['completed_at'])
    const sourceRank = SOURCE_RANK[source]
    return {
        category: 'file-change',
        provider: normalizeProvider(record['provider'], defaults.provider),
        status,
        toolName: readString(record['toolName'] || record['tool_name']),
        itemId: readString(record['itemId'] || record['item_id']),
        toolCallId: readString(record['toolCallId'] || record['tool_call_id']),
        revision: Math.max(0, Math.floor(readNumber(record['revision']) ?? defaults.revision ?? 0)),
        source,
        authoritative: readBoolean(record['authoritative']) ?? sourceRank >= SOURCE_RANK['synthetic-snapshot'],
        changes,
        paths,
        createdPaths,
        fileCount: paths.length,
        patch: boundedPatch.text,
        previewPatch: boundedPreview.text,
        displayDiff: boundedDisplay.text,
        additions: readNumber(record['additions']) ?? patchStats.additions,
        deletions: readNumber(record['deletions']) ?? patchStats.deletions,
        startedAt,
        completedAt,
        durationMs: readNumber(record['durationMs'] || record['duration_ms']),
        output: readString(record['output']),
        errorMessage: readString(record['errorMessage'] || record['error_message']),
        truncated: readBoolean(record['truncated']) || boundedPatch.truncated || boundedPreview.truncated || boundedDisplay.truncated || undefined,
        diffUnavailableReason: record['diffUnavailableReason'] === 'binary'
            || record['diffUnavailableReason'] === 'too-large'
            || record['diffUnavailableReason'] === 'snapshot-failed'
            || record['diffUnavailableReason'] === 'preview-only'
            ? record['diffUnavailableReason']
            : undefined,
        snapshotBacked: readBoolean(record['snapshotBacked'])
    }
}

function patchAddsCoverage(existing: NormalizedFileChangePayload, incoming: NormalizedFileChangePayload): boolean {
    const existingPaths = new Set(existing.paths.map((path) => normalizeFileChangePath(path).toLowerCase()))
    return incoming.paths.some((path) => !existingPaths.has(normalizeFileChangePath(path).toLowerCase()))
}

export function mergeNormalizedFileChangePayload(
    existing: NormalizedFileChangePayload,
    incoming: NormalizedFileChangePayload
): NormalizedFileChangePayload {
    const existingRank = SOURCE_RANK[existing.source]
    const incomingRank = SOURCE_RANK[incoming.source]
    const staleRevision = incoming.source !== 'turn-final'
        && incomingRank <= existingRank
        && incoming.revision < existing.revision
    const lowerAuthority = incomingRank < existingRank
    const acceptCanonical = !lowerAuthority && !staleRevision
    const changes = acceptCanonical
        ? mergeChanges(existing.changes, incoming.changes, incoming.source)
        : existing.changes
    const shouldUseIncomingPatch = acceptCanonical && Boolean(incoming.patch) && (
        incomingRank > existingRank
        || incoming.source !== 'turn-final'
        || !existing.patch
        || !existing.authoritative
        || patchAddsCoverage(existing, incoming)
    )
    const patch = shouldUseIncomingPatch ? incoming.patch : existing.patch
    const previewPatch = incoming.previewPatch || existing.previewPatch
    const paths = uniquePaths([
        ...changes.map((change) => change.path),
        ...existing.paths,
        ...(acceptCanonical ? incoming.paths : [])
    ])
    const createdPaths = uniquePaths([
        ...changes.filter((change) => change.kind === 'add' || change.isNew).map((change) => change.path),
        ...existing.createdPaths,
        ...(acceptCanonical ? incoming.createdPaths : [])
    ])
    const stats = getFileChangePatchStats(patch || previewPatch)
    const status = terminalStatus(existing.status, incoming.status)
    const completedAt = status === 'running'
        ? undefined
        : existing.completedAt || incoming.completedAt
    const startedMs = Date.parse(existing.startedAt)
    const completedMs = completedAt ? Date.parse(completedAt) : Number.NaN
    const computedDuration = Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? Math.max(0, completedMs - startedMs)
        : undefined
    const source = acceptCanonical && (
        incomingRank > existingRank
        || (incoming.source === 'provider-result' && existing.source === 'turn-final')
    ) ? incoming.source : existing.source
    return {
        ...existing,
        provider: existing.provider,
        status,
        toolName: incoming.toolName || existing.toolName,
        itemId: incoming.itemId || existing.itemId,
        toolCallId: incoming.toolCallId || existing.toolCallId,
        revision: Math.max(existing.revision, acceptCanonical ? incoming.revision : existing.revision),
        source,
        authoritative: existing.authoritative || (acceptCanonical && incoming.authoritative),
        changes,
        paths,
        createdPaths,
        fileCount: paths.length,
        patch,
        previewPatch,
        displayDiff: acceptCanonical ? incoming.displayDiff || existing.displayDiff : existing.displayDiff,
        additions: stats.additions,
        deletions: stats.deletions,
        startedAt: existing.startedAt,
        completedAt,
        durationMs: incoming.durationMs ?? existing.durationMs ?? computedDuration,
        output: incoming.output || existing.output,
        errorMessage: incoming.errorMessage || existing.errorMessage,
        truncated: existing.truncated || (acceptCanonical && incoming.truncated) || undefined,
        diffUnavailableReason: patch ? undefined : incoming.diffUnavailableReason || existing.diffUnavailableReason,
        snapshotBacked: existing.snapshotBacked || (acceptCanonical && incoming.snapshotBacked) || undefined
    }
}

export function mergeFileChangePayloadRecords(
    existingValue: unknown,
    incomingValue: unknown,
    defaults: { provider: FileChangeProvider; startedAt: string }
): NormalizedFileChangePayload {
    const existing = normalizeFileChangePayload(existingValue, {
        ...defaults,
        source: 'args-preview',
        status: 'running'
    })
    const incomingRecord = asRecord(incomingValue) || {}
    const incoming = normalizeFileChangePayload(incomingValue, {
        ...defaults,
        source: normalizeSource(incomingRecord['source'], 'args-preview'),
        status: normalizeStatus(incomingRecord['status'], 'running')
    })
    return mergeNormalizedFileChangePayload(existing, incoming)
}

export function fileChangePathsOverlap(left: unknown, right: unknown): boolean {
    const leftSet = new Set(readStringArray(left).map((path) => normalizeFileChangePath(path).toLowerCase()))
    return readStringArray(right).some((path) => leftSet.has(normalizeFileChangePath(path).toLowerCase()))
}
