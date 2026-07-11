export function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

export function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

const PATH_VALUE_KEYS = [
    'path',
    'filePath',
    'targetPath',
    'sourcePath',
    'destinationPath',
    'oldPath',
    'newPath',
    'file_path',
    'target_path',
    'source_path',
    'destination_path',
    'old_path',
    'new_path',
    'relativePath',
    'absolutePath'
] as const

const PATCH_TEXT_KEYS = new Set([
    'patch',
    'diff',
    'content',
    'text',
    'input',
    'output',
    'stdout',
    'stderr',
    'result',
    'response',
    'changes',
    'edits',
    'arguments'
])

const FILE_CHANGE_ADDITION_KEYS = ['additions', 'insertions', 'added', 'addedLines', 'linesAdded', 'lines_added'] as const
const FILE_CHANGE_DELETION_KEYS = ['deletions', 'removals', 'removed', 'deletedLines', 'linesDeleted', 'lines_deleted'] as const
const FILE_CHANGE_COUNT_KEYS = ['fileCount', 'filesChanged', 'changedFiles', 'count', 'file_count'] as const

function normalizeExtractedPath(value: string, options?: { stripDiffPrefix?: boolean }): string | undefined {
    let candidate = String(value || '').trim()
    if (!candidate) return undefined
    candidate = candidate.replace(/^['"`]+|['"`]+$/g, '').trim()
    if (!candidate || candidate === '/dev/null') return undefined
    if (options?.stripDiffPrefix) {
        candidate = candidate.replace(/^[ab]\//, '')
    }
    return candidate || undefined
}

function extractPathsFromText(value: unknown): string[] {
    const text = readTextValue(value)
    if (!text) return []

    const matches = new Set<string>()
    const normalizedText = text.replace(/\r\n/g, '\n')
    const addPath = (candidate: string | undefined, stripDiffPrefix = false) => {
        const normalizedPath = normalizeExtractedPath(candidate || '', { stripDiffPrefix })
        if (normalizedPath) matches.add(normalizedPath)
    }

    for (const match of normalizedText.matchAll(/^\*\*\* (?:Update|Add|Delete) File:\s+(.+)$/gm)) {
        addPath(match[1])
    }
    for (const match of normalizedText.matchAll(/^\*\*\* Move to:\s+(.+)$/gm)) {
        addPath(match[1])
    }
    for (const match of normalizedText.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
        addPath(match[1], true)
        addPath(match[2], true)
    }
    for (const match of normalizedText.matchAll(/^(?:\+\+\+|---)\s+(?:[ab]\/)?(.+)$/gm)) {
        addPath(match[1], true)
    }

    return [...matches]
}

function looksLikePatchText(value: string): boolean {
    return value.includes('diff --git ')
        || value.includes('@@ ')
        || value.includes('*** Update File:')
        || value.includes('*** Add File:')
        || value.includes('*** Delete File:')
        || value.includes('*** Move to:')
        || (value.includes('--- ') && value.includes('+++ '))
}

function collectPatchTexts(
    value: unknown,
    target: Set<string>,
    seen = new WeakSet<object>(),
    depth = 0
): void {
    if (depth > 6) return
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (looksLikePatchText(trimmed)) target.add(trimmed)
        return
    }
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
        for (const entry of value) {
            collectPatchTexts(entry, target, seen, depth + 1)
        }
        return
    }

    const record = asRecord(value)
    if (!record) return
    for (const [key, entry] of Object.entries(record)) {
        if (!PATCH_TEXT_KEYS.has(key)) continue
        collectPatchTexts(entry, target, seen, depth + 1)
    }
    for (const entry of Object.values(record)) {
        collectPatchTexts(entry, target, seen, depth + 1)
    }
}

function readPatchText(value: unknown): string | undefined {
    const texts = new Set<string>()
    collectPatchTexts(value, texts)
    const combined = [...texts].join('\n\n').trim()
    return combined || undefined
}

function readNestedNumericStat(
    value: unknown,
    keys: readonly string[],
    seen = new WeakSet<object>(),
    depth = 0
): number | undefined {
    if (depth > 6 || !value || typeof value !== 'object') return undefined
    if (seen.has(value)) return undefined
    seen.add(value)

    if (Array.isArray(value)) {
        let total = 0
        let found = false
        for (const entry of value) {
            const nested = readNestedNumericStat(entry, keys, seen, depth + 1)
            if (nested === undefined) continue
            total += nested
            found = true
        }
        return found ? total : undefined
    }

    const record = asRecord(value)
    if (!record) return undefined
    for (const key of keys) {
        const direct = readNumericValue(record[key])
        if (direct !== undefined) return direct
    }

    let total = 0
    let found = false
    for (const entry of Object.values(record)) {
        const nested = readNestedNumericStat(entry, keys, seen, depth + 1)
        if (nested === undefined) continue
        total += nested
        found = true
    }
    return found ? total : undefined
}

function collectItemPaths(value: unknown, target: Set<string>, seen = new WeakSet<object>(), depth = 0): void {
    if (depth > 6) return
    if (typeof value === 'string') {
        for (const candidate of extractPathsFromText(value)) {
            target.add(candidate)
        }
        return
    }
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
        for (const entry of value) {
            collectItemPaths(entry, target, seen, depth + 1)
        }
        return
    }

    const record = asRecord(value)
    if (!record) return

    for (const key of PATH_VALUE_KEYS) {
        for (const candidate of readStringArray(record[key])) {
            target.add(candidate)
        }
    }
    for (const [key, entry] of Object.entries(record)) {
        if (PATCH_TEXT_KEYS.has(key)) {
            for (const candidate of extractPathsFromText(entry)) {
                target.add(candidate)
            }
        }
        collectItemPaths(entry, target, seen, depth + 1)
    }
}

export function normalizeItemType(value: unknown): string {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[._/-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

export function readTextValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed || undefined
    }
    if (Array.isArray(value)) {
        const combined = value
            .map((entry) => readTextValue(entry))
            .filter((entry): entry is string => Boolean(entry))
            .join('\n')
            .trim()
        return combined || undefined
    }
    const record = asRecord(value)
    if (!record) return undefined
    return readTextValue(
        record['text']
        ?? record['value']
        ?? record['message']
        ?? record['content']
        ?? record['parts']
        ?? record['output']
    )
}

export function readStringArray(value: unknown): string[] {
    if (typeof value === 'string') {
        const normalized = normalizeExtractedPath(value)
        return normalized ? [normalized] : []
    }
    if (!Array.isArray(value)) return []
    return value
        .map((entry) => {
            if (typeof entry === 'string') return entry.trim()
            const record = asRecord(entry)
            return asString(record?.['path'])?.trim()
                || asString(record?.['filePath'])?.trim()
                || asString(record?.['targetPath'])?.trim()
                || asString(record?.['sourcePath'])?.trim()
                || asString(record?.['destinationPath'])?.trim()
                || asString(record?.['oldPath'])?.trim()
                || asString(record?.['newPath'])?.trim()
                || asString(record?.['file_path'])?.trim()
                || asString(record?.['target_path'])?.trim()
                || asString(record?.['source_path'])?.trim()
                || asString(record?.['destination_path'])?.trim()
                || asString(record?.['old_path'])?.trim()
                || asString(record?.['new_path'])?.trim()
                || asString(record?.['relativePath'])?.trim()
                || asString(record?.['absolutePath'])?.trim()
                || asString(record?.['name'])?.trim()
                || ''
        })
        .map((entry) => normalizeExtractedPath(entry || ''))
        .filter((entry): entry is string => Boolean(entry))
}

export function extractItemPaths(item: Record<string, unknown>): string[] {
    const candidates = new Set<string>([
        ...readStringArray(item['path']),
        ...readStringArray(item['filePath']),
        ...readStringArray(item['targetPath']),
        ...readStringArray(item['sourcePath']),
        ...readStringArray(item['destinationPath']),
        ...readStringArray(item['oldPath']),
        ...readStringArray(item['newPath']),
        ...readStringArray(item['paths']),
        ...readStringArray(item['files'])
    ])
    collectItemPaths(item, candidates)
    return [...candidates]
}

function hasDisplayValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
    return true
}

function stringifyJsonValue(value: unknown, pretty = true): string | undefined {
    if (!hasDisplayValue(value)) return undefined
    if (typeof value === 'string') return value.trim() || undefined
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0)
    } catch {
        return undefined
    }
}

function readDisplayValue(value: unknown): string | undefined {
    return readTextValue(value) || stringifyJsonValue(value)
}

export function readToolOutput(item: Record<string, unknown>): string | undefined {
    return readTextValue(item['stdout'])
        || readTextValue(item['stderr'])
        || readTextValue(item['output'])
        || readTextValue(item['aggregatedOutput'])
        || readTextValue(item['aggregated_output'])
        || readTextValue(item['formattedOutput'])
        || readTextValue(item['formatted_output'])
        || readTextValue(item['result'])
        || readTextValue(asRecord(item['result'])?.['output'])
        || readTextValue(asRecord(item['result'])?.['stdout'])
        || readTextValue(asRecord(item['result'])?.['stderr'])
        || readTextValue(asRecord(item['response'])?.['output'])
        || readTextValue(asRecord(item['response'])?.['result'])
        || readDisplayValue(item['structuredContent'])
        || readDisplayValue(asRecord(item['result'])?.['structuredContent'])
        || readDisplayValue(item['contentItems'])
        || readDisplayValue(item['tools'])
        || readDisplayValue(item['result'])
        || readDisplayValue(item['response'])
}

export function readNumericValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

export function readToolTiming(item: Record<string, unknown>) {
    const startedAt = asString(item['startedAt']) || asString(item['started_at']) || asString(item['startTime']) || asString(item['start_time'])
    const completedAt = asString(item['completedAt']) || asString(item['completed_at']) || asString(item['finishedAt']) || asString(item['finished_at']) || asString(item['endedAt']) || asString(item['ended_at'])
    const durationMs = readNumericValue(item['durationMs']) || readNumericValue(item['duration_ms']) || readNumericValue(item['elapsedMs']) || readNumericValue(item['elapsed_ms'])

    return {
        startedAt,
        completedAt,
        durationMs
    }
}

function readToolArguments(item: Record<string, unknown>): unknown {
    const inputRecord = asRecord(item['input'])
    const actionRecord = asRecord(item['action'])
    return item['arguments']
        ?? inputRecord?.['arguments']
        ?? inputRecord
        ?? item['input']
        ?? item['params']
        ?? actionRecord
}

function readCommandValue(item: Record<string, unknown>): string | undefined {
    const inputRecord = asRecord(item['input'])
    const actionRecord = asRecord(item['action'])
    const actionCommand = actionRecord?.['command']
    if (Array.isArray(actionCommand)) {
        const command = actionCommand
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .join(' ')
            .trim()
        if (command) return command
    }

    return readTextValue(item['command'])
        || readTextValue(inputRecord?.['command'])
        || readTextValue(actionCommand)
}

function readActionQuery(item: Record<string, unknown>): string | undefined {
    const action = asRecord(item['action'])
    const queries = Array.isArray(action?.['queries'])
        ? action?.['queries'].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
    return readTextValue(action?.['query'])
        || (queries.length > 0 ? queries.join(', ') : undefined)
}

function readToolErrorText(value: unknown): string | undefined {
    const errorRecord = asRecord(value)
    return readTextValue(value)
        || readTextValue(errorRecord?.['message'])
        || readTextValue(errorRecord?.['error'])
        || stringifyJsonValue(value)
}

function isRunningStatus(status: string | undefined): boolean {
    const normalized = normalizeItemType(status)
    return normalized === 'in progress'
        || normalized === 'running'
        || normalized === 'pending'
        || normalized === 'started'
}

function isFailedStatus(status: string | undefined): boolean {
    const normalized = normalizeItemType(status)
    return normalized === 'failed'
        || normalized === 'error'
        || normalized === 'cancelled'
        || normalized === 'declined'
}

function formatToolTranscript(input: {
    invocation: string
    argumentsValue?: unknown
    output?: string
    error?: string
    status?: string
}): string {
    const compactArguments = stringifyJsonValue(input.argumentsValue, false)
    const lines = [`$ ${input.invocation}${compactArguments ? ` ${compactArguments}` : ''}`]
    const output = input.error
        ? `! ${input.error}`
        : input.output
            ? input.output
            : isRunningStatus(input.status)
                ? 'waiting for output...'
                : 'no output'

    return [...lines, '', output].join('\n')
}

function buildToolSummary(input: { running: string; completed: string; failed: string; status?: string; hasError?: boolean }): string {
    if (input.hasError || isFailedStatus(input.status)) return input.failed
    if (isRunningStatus(input.status)) return input.running
    return input.completed
}

function readPatchSummary(value: unknown): { additions: number; deletions: number; fileCount: number } | null {
    const text = readPatchText(value)
    if (!text) return null

    const normalized = text.replace(/\r\n/g, '\n')
    let additions = 0
    let deletions = 0
    const pathCandidates = new Set<string>(extractPathsFromText(normalized))

    for (const line of normalized.split('\n')) {
        if (line.startsWith('diff --git ')) continue
        if (line.startsWith('+++ ') || line.startsWith('--- ')) continue
        if (line.startsWith('+')) {
            additions += 1
            continue
        }
        if (line.startsWith('-')) {
            deletions += 1
        }
    }

    let fileCount = pathCandidates.size
    if (fileCount === 0 && (additions > 0 || deletions > 0)) {
        fileCount = 1
    }

    return { additions, deletions, fileCount }
}

function readCreatedFilePaths(value: unknown): string[] {
    const patchText = readPatchText(value)
    if (!patchText) return []

    const matches = new Set<string>()
    const normalizedText = patchText.replace(/\r\n/g, '\n')
    const addPath = (candidate: string | undefined, stripDiffPrefix = false) => {
        const normalizedPath = normalizeExtractedPath(candidate || '', { stripDiffPrefix })
        if (normalizedPath) matches.add(normalizedPath)
    }

    for (const match of normalizedText.matchAll(/^\*\*\* Add File:\s+(.+)$/gm)) {
        addPath(match[1])
    }

    let pendingCreatedFromDevNull = false
    for (const line of normalizedText.split('\n')) {
        if (line.startsWith('--- /dev/null')) {
            pendingCreatedFromDevNull = true
            continue
        }
        if (!pendingCreatedFromDevNull) continue
        const nextFileMatch = /^(?:\+\+\+)\s+(?:[ab]\/)?(.+)$/.exec(line)
        if (nextFileMatch) {
            addPath(nextFileMatch[1], true)
            pendingCreatedFromDevNull = false
            continue
        }
        if (line.trim()) pendingCreatedFromDevNull = false
    }

    return [...matches]
}

export function buildToolActivity(item: Record<string, unknown>, itemType: string):
    | {
        kind: string
        summary: string
        detail?: string
        tone: 'info' | 'tool' | 'warning' | 'error'
        data: Record<string, unknown>
    }
    | null {
    const command = readCommandValue(item)
    const query = readTextValue(item['query']) || readTextValue(item['pattern']) || readTextValue(item['url']) || readActionQuery(item)
    const serverName = readTextValue(item['server']) || readTextValue(item['namespace'])
    const rawToolName = readTextValue(item['tool']) || readTextValue(item['name']) || readTextValue(item['execution'])
    const toolName = serverName && rawToolName ? `${serverName}.${rawToolName}` : rawToolName
    const status = readTextValue(item['status']) || readTextValue(item['state']) || readTextValue(item['phase'])
    const argumentsValue = readToolArguments(item)
    const paths = extractItemPaths(item)
    const output = readToolOutput(item)
    const timing = readToolTiming(item)
    const detail = readTextValue(item['detail'])
        || readTextValue(item['summary'])
        || readTextValue(item['description'])
        || readTextValue(item['message'])
        || readTextValue(item['text'])
        || readTextValue(item['content'])
        || output

    if (itemType.includes('file read') || (itemType.includes('file') && !itemType.includes('change') && paths.length > 0)) {
        return {
            kind: 'file-read',
            summary: paths.length > 1 ? 'Read files' : 'Read file',
            detail: paths.join('\n') || detail,
            tone: 'tool',
            data: { itemType, status, paths, startedAt: timing.startedAt, completedAt: timing.completedAt, durationMs: timing.durationMs }
        }
    }

    if (itemType.includes('file change') || itemType.includes('edit')) {
        const patchSummary = readPatchSummary(item)
        const patch = readPatchText(item)
        const createdPaths = readCreatedFilePaths(item)
        const additions = readNestedNumericStat(item, FILE_CHANGE_ADDITION_KEYS) ?? patchSummary?.additions
        const deletions = readNestedNumericStat(item, FILE_CHANGE_DELETION_KEYS) ?? patchSummary?.deletions
        const fileCount = readNestedNumericStat(item, FILE_CHANGE_COUNT_KEYS) ?? patchSummary?.fileCount ?? (paths.length > 0 ? paths.length : undefined)
        return {
            kind: 'file-change',
            summary: paths.length > 1 ? 'Edited files' : 'Edited file',
            detail: paths.join('\n') || detail,
            tone: 'tool',
            data: {
                itemType,
                status,
                paths,
                createdPaths,
                patch,
                additions,
                deletions,
                fileCount,
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('mcp tool call')) {
        const result = item['result']
        const resultRecord = asRecord(result)
        const error = item['error']
        const errorText = readToolErrorText(error)
        const resultOutput = output || readDisplayValue(resultRecord?.['content']) || readDisplayValue(resultRecord?.['structuredContent'])
        const invocation = toolName || rawToolName || 'mcp.tool'
        return {
            kind: 'tool',
            summary: buildToolSummary({
                running: 'Running MCP tool',
                completed: 'Ran MCP tool',
                failed: 'MCP tool failed',
                status,
                hasError: Boolean(errorText)
            }),
            detail: invocation,
            tone: errorText ? 'error' : 'tool',
            data: {
                category: 'mcp-tool',
                itemType,
                status: errorText ? 'failed' : status,
                server: serverName,
                tool: rawToolName,
                toolName: invocation,
                arguments: argumentsValue,
                input: stringifyJsonValue(argumentsValue),
                result,
                structuredContent: resultRecord?.['structuredContent'],
                error,
                output: formatToolTranscript({
                    invocation,
                    argumentsValue,
                    output: resultOutput,
                    error: errorText,
                    status
                }),
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('dynamic tool call')) {
        const successValue = item['success']
        const effectiveStatus = status || (successValue === false ? 'failed' : successValue === true ? 'completed' : undefined)
        const contentItems = item['contentItems']
        const contentOutput = output || readDisplayValue(contentItems)
        const invocation = toolName || rawToolName || 'tool.call'
        return {
            kind: 'tool',
            summary: buildToolSummary({
                running: 'Running tool',
                completed: 'Ran tool',
                failed: 'Tool failed',
                status: effectiveStatus,
                hasError: successValue === false
            }),
            detail: invocation,
            tone: successValue === false ? 'error' : 'tool',
            data: {
                category: 'dynamic-tool',
                itemType,
                status: effectiveStatus,
                tool: rawToolName,
                toolName: invocation,
                arguments: argumentsValue,
                input: stringifyJsonValue(argumentsValue),
                contentItems,
                success: successValue,
                output: formatToolTranscript({
                    invocation,
                    argumentsValue,
                    output: contentOutput,
                    error: successValue === false && !contentOutput ? 'Tool returned failure.' : undefined,
                    status: effectiveStatus
                }),
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('web search')) {
        const action = item['action']
        const invocation = 'web.search'
        return {
            kind: 'search',
            summary: buildToolSummary({
                running: 'Searching web',
                completed: 'Searched web',
                failed: 'Web search failed',
                status
            }),
            detail: query || detail,
            tone: 'tool',
            data: {
                category: 'web-search',
                itemType,
                status,
                query,
                action,
                arguments: action || argumentsValue,
                input: stringifyJsonValue(action || argumentsValue),
                output: formatToolTranscript({
                    invocation,
                    argumentsValue: action || argumentsValue || (query ? { query } : undefined),
                    output,
                    status
                }),
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('search') || itemType.includes('web') || query) {
        const invocation = toolName || (itemType.includes('tool search') ? 'tool.search' : 'search')
        return {
            kind: 'search',
            summary: buildToolSummary({
                running: 'Searching',
                completed: 'Searched',
                failed: 'Search failed',
                status
            }),
            detail: query || invocation || detail,
            tone: 'tool',
            data: {
                itemType,
                status,
                toolName: invocation,
                query,
                arguments: argumentsValue,
                input: stringifyJsonValue(argumentsValue),
                output: formatToolTranscript({
                    invocation,
                    argumentsValue: argumentsValue || (query ? { query } : undefined),
                    output: output && output !== query ? output : detail && detail !== query ? detail : undefined,
                    status
                }),
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('command') || itemType.includes('shell call') || itemType.includes('local shell') || command) {
        const exitCode = readNumericValue(item['exitCode']) ?? readNumericValue(item['exit_code'])
        const actionRecord = asRecord(item['action'])
        const cwd = readTextValue(item['cwd'])
            || readTextValue(item['workingDirectory'])
            || readTextValue(item['working_directory'])
            || readTextValue(actionRecord?.['working_directory'])
        const source = readTextValue(item['source'])
        const processId = readTextValue(item['processId']) || readTextValue(item['process_id'])
        const normalizedStatus = normalizeItemType(status)
        const summary = normalizedStatus === 'in progress'
            ? 'Running command'
            : normalizedStatus === 'failed'
                ? 'Command failed'
                : normalizedStatus === 'declined'
                    ? 'Command declined'
                    : 'Ran command'
        return {
            kind: 'command',
            summary,
            detail: command || detail,
            tone: 'tool',
            data: {
                itemType,
                status,
                command,
                cwd,
                source,
                processId,
                paths,
                exitCode,
                output: output && output !== command ? output : detail && detail !== command ? detail : undefined,
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    if (itemType.includes('tool') || itemType.includes('function') || toolName) {
        const invocation = toolName || rawToolName || (itemType.includes('output') ? 'tool.output' : 'tool.call')
        const errorText = readToolErrorText(item['error'])
        const toolOutput = output && output !== toolName ? output : detail && detail !== toolName ? detail : undefined
        const isOutputOnly = itemType.includes('output') && !toolName && !rawToolName
        return {
            kind: 'tool',
            summary: buildToolSummary({
                running: 'Running tool',
                completed: 'Ran tool',
                failed: 'Tool failed',
                status,
                hasError: Boolean(errorText)
            }),
            detail: toolName || rawToolName || (isOutputOnly ? undefined : detail),
            tone: errorText ? 'error' : 'tool',
            data: {
                itemType,
                status: errorText ? 'failed' : status,
                toolName,
                tool: rawToolName,
                server: serverName,
                paths,
                arguments: argumentsValue,
                input: stringifyJsonValue(argumentsValue),
                result: item['result'],
                response: item['response'],
                error: item['error'],
                output: formatToolTranscript({
                    invocation,
                    argumentsValue,
                    output: toolOutput,
                    error: errorText,
                    status
                }),
                startedAt: timing.startedAt,
                completedAt: timing.completedAt,
                durationMs: timing.durationMs
            }
        }
    }

    return null
}
