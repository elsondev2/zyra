import { randomUUID } from 'node:crypto'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import { isAbsolute, join, resolve } from 'node:path'
import log from 'electron-log'
import type {
    AssistantAccountIdentity,
    AssistantApprovalDecision,
    AssistantInteractionMode,
    AssistantModelInfo,
    AssistantRateLimitSnapshot,
    AssistantReasoningEffort,
    AssistantRuntimeEvent,
    AssistantRuntimeMode,
    AssistantThread,
    AssistantTurnUsage,
    FleetSnapshot
} from '../../shared/assistant/contracts'
import { parseAgentSurfaceDescriptor, sanitizeFileChangeRawPayload } from '../../shared/assistant/contracts'
import { getAssistantModelReasoningEfforts, isAssistantReasoningEffort } from '../../shared/assistant/reasoning-efforts'
import { analyzeAssistantReadResult } from '../../shared/assistant/read-activity'
import { resolveZyraRoot } from '../zyra/zyra-root'
import type { PreparedAssistantPromptImage } from './prompt-images'
import { getAssistantCanonicalThreadId } from './thread-identity'
import { getAgentControlBroker } from '../agent-control'
import { AgentControlError, toAgentControlError } from '../agent-control/control-errors'

type ActiveCompactionLifecycle = {
    activityId: string
    startedAt: string
    reason: string
    turnId: string | null
}

type ZyraSessionContext = {
    localThreadId: string
    providerThreadId: string
    resumeProviderThreadId: string | null
    worker: ZyraPiWorker
    unsubscribe?: () => void
    connected: boolean
    connectPromise: Promise<void> | null
    cwd: string
    model: string
    thinking: AssistantReasoningEffort
    runtimeMode: AssistantRuntimeMode
    interactionMode: AssistantInteractionMode
    profile: string
    activeTurnId: string | null
    assistantMessageSequence: number
    activeAssistantItemId: string | null
    toolArgsByCallId: Map<string, Record<string, unknown>>
    toolStartedAtByCallId: Map<string, string>
    commandActivityIdByJobId: Map<string, string>
    assistantTextByItemId: Map<string, string>
    assistantCompletedItemIds: Set<string>
    internalTextByItemId: Map<string, string>
    internalCompletedItemIds: Set<string>
    activeCompaction: ActiveCompactionLifecycle | null
    lastAssistantItemId: string | null
    lastUsage: AssistantTurnUsage | null
}

type BridgeMessage = {
    type?: string
    id?: number
    requestId?: string
    operation?: unknown
    ok?: boolean
    result?: Record<string, unknown>
    event?: unknown
    error?: string
    stack?: string
}

type PendingBridgeRequest = {
    resolve: (result: Record<string, unknown>) => void
    reject: (error: Error) => void
}

type NodeLaunch = {
    command: string
    env: NodeJS.ProcessEnv
}

type AssistantContentParts = {
    thinking: string
    text: string
    hasThinkingBlock: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function nowIso(): string {
    return new Date().toISOString()
}

function emptyAssistantContentParts(): AssistantContentParts {
    return { thinking: '', text: '', hasThinkingBlock: false }
}

function hasAssistantContentText(content: AssistantContentParts): boolean {
    return Boolean(content.text.trim())
}

function hasAssistantThinkingText(content: AssistantContentParts): boolean {
    return Boolean(content.thinking.trim())
}

function assistantContentPartsKey(content: AssistantContentParts): string {
    return `${content.thinking}\u0000${content.text}`
}

function extractAssistantContentParts(content: unknown): AssistantContentParts {
    if (typeof content === 'string') return { thinking: '', text: content, hasThinkingBlock: false }
    if (!Array.isArray(content)) return emptyAssistantContentParts()

    const thinking: string[] = []
    const text: string[] = []
    let hasThinkingBlock = false
    for (const part of content) {
        const record = asRecord(part)
        const type = asString(record?.['type'])
        if (type === 'thinking') {
            hasThinkingBlock = true
            const value = asString(record?.['thinking']) || asString(record?.['text'])
            if (value) thinking.push(value)
            continue
        }
        if (type === 'text') {
            const value = asString(record?.['text'])
            if (value) text.push(value)
        }
    }

    return {
        thinking: thinking.join('\n'),
        text: text.join('\n'),
        hasThinkingBlock
    }
}

function commonPrefixLength(left: string, right: string): number {
    const max = Math.min(left.length, right.length)
    let index = 0
    while (index < max && left[index] === right[index]) index += 1
    return index
}

function suffixPrefixOverlap(left: string, right: string): number {
    const max = Math.min(left.length, right.length)
    for (let size = max; size > 0; size -= 1) {
        if (left.slice(-size) === right.slice(0, size)) return size
    }
    return 0
}

function separateThinkingFromAssistantText(content: AssistantContentParts): AssistantContentParts {
    if (!content.hasThinkingBlock || !content.thinking || !content.text) return content
    const overlap = content.text.startsWith(content.thinking)
        ? content.thinking.length
        : suffixPrefixOverlap(content.thinking, content.text)
    const comparableLength = Math.min(content.thinking.length, content.text.length)
    const minimumOverlap = Math.min(24, Math.max(8, Math.floor(comparableLength * 0.25)))
    if (overlap < minimumOverlap) return content
    return {
        ...content,
        text: content.text.slice(overlap).replace(/^(?:\r?\n){1,2}/, '')
    }
}

function mergeAssistantTextDelta(currentText: string, deltaText: string): string {
    if (!currentText) return deltaText
    if (!deltaText) return currentText
    if (deltaText === currentText || currentText.endsWith(deltaText)) return currentText
    if (deltaText.startsWith(currentText)) return deltaText
    const sharedPrefix = commonPrefixLength(currentText, deltaText)
    if (sharedPrefix >= 5 && deltaText.length >= Math.floor(currentText.length * 0.6)) return deltaText
    if (sharedPrefix >= 12 && deltaText.length >= Math.floor(currentText.length * 0.35)) return deltaText
    if (currentText.includes(deltaText) && (deltaText.length >= 8 || /\r|\n/.test(deltaText))) return currentText

    const overlap = suffixPrefixOverlap(currentText, deltaText)
    if (overlap > 0) return `${currentText}${deltaText.slice(overlap)}`

    return `${currentText}${deltaText}`
}

function deltaFromMergedText(previousText: string, nextText: string): string {
    if (!nextText || nextText === previousText) return ''
    return nextText.startsWith(previousText) ? nextText.slice(previousText.length) : nextText
}

function isExpectedBridgeDisposalError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '')
    return /Zyra bridge (?:disposed|stopped)\./i.test(message)
}

function longerAssistantContentParts(...contents: AssistantContentParts[]): AssistantContentParts {
    return contents.reduce((best, content) => ({
        thinking: content.thinking.length > best.thinking.length ? content.thinking : best.thinking,
        text: content.text.length > best.text.length ? content.text : best.text,
        hasThinkingBlock: best.hasThinkingBlock || content.hasThinkingBlock
    }), emptyAssistantContentParts())
}

function extractAssistantEventContentParts(event: Record<string, unknown>, current: AssistantContentParts): AssistantContentParts {
    const message = asRecord(event['message'])
    const assistantMessageEvent = asRecord(event['assistantMessageEvent'])
    const messageContent = extractAssistantContentParts(message?.['content'])
    const partial = asRecord(assistantMessageEvent?.['partial'])
    const partialContent = extractAssistantContentParts(partial?.['content'])
    const eventContent = extractAssistantContentParts(assistantMessageEvent?.['content'])
    const content = separateThinkingFromAssistantText(
        longerAssistantContentParts(messageContent, partialContent, eventContent, current)
    )
    if (assistantContentPartsKey(content) !== assistantContentPartsKey(current)) return content

    const delta = asString(assistantMessageEvent?.['delta'])
    const eventType = asString(assistantMessageEvent?.['type'])
    if (eventType === 'thinking_delta' && delta) {
        return {
            ...current,
            hasThinkingBlock: true,
            thinking: mergeAssistantTextDelta(current.thinking, delta)
        }
    }
    if (eventType === 'text_delta' && delta) {
        return {
            ...current,
            text: mergeAssistantTextDelta(current.text, delta)
        }
    }

    return content
}

function isReasoningOnlyAssistantEvent(event: Record<string, unknown>): boolean {
    const message = asRecord(event['message'])
    const assistantMessageEvent = asRecord(event['assistantMessageEvent'])
    const candidates = [
        asString(event['channel']),
        asString(event['streamKind']),
        asString(event['kind']),
        asString(message?.['channel']),
        asString(message?.['type']),
        asString(assistantMessageEvent?.['channel']),
        asString(assistantMessageEvent?.['type']),
        asString(assistantMessageEvent?.['kind'])
    ]
    return candidates.some((entry) => {
        const normalized = String(entry || '').trim().toLowerCase().replace(/[.\-/:]+/g, '_')
        return /(?:^|_)(?:reasoning|analysis|thinking|thought)(?:_|$)/.test(normalized)
    })
}

function readAssistantEventSourceItemId(event: Record<string, unknown>): string | null {
    const message = asRecord(event['message'])
    const assistantMessageEvent = asRecord(event['assistantMessageEvent'])
    return asString(message?.['id'])
        || asString(assistantMessageEvent?.['id'])
        || asString(assistantMessageEvent?.['itemId'])
        || asString(assistantMessageEvent?.['messageId'])
}

function resolveAssistantEventItemId(
    context: ZyraSessionContext,
    event: Record<string, unknown>,
    turnId: string,
    eventType: string
): string {
    const sourceItemId = readAssistantEventSourceItemId(event)
    if (eventType === 'message_start') {
        context.assistantMessageSequence += 1
        const itemId = sourceItemId || `zyra-assistant-${turnId}-${context.assistantMessageSequence}`
        context.activeAssistantItemId = itemId
        return itemId
    }

    if (context.activeAssistantItemId) return context.activeAssistantItemId

    context.assistantMessageSequence += 1
    const itemId = sourceItemId || `zyra-assistant-${turnId}-${context.assistantMessageSequence}`
    context.activeAssistantItemId = itemId
    return itemId
}

function readUsage(value: unknown): AssistantTurnUsage | null {
    const usage = asRecord(value)
    if (!usage) return null
    const numberValue = (key: string): number | null => {
        const raw = usage[key]
        return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    }
    return {
        inputTokens: numberValue('input'),
        outputTokens: numberValue('output'),
        cachedInputTokens: numberValue('cacheRead'),
        reasoningOutputTokens: numberValue('reasoning') ?? numberValue('reasoningTokens'),
        totalTokens: numberValue('total')
    }
}

function summarizeValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value.slice(0, 300)
    if (value === undefined || value === null) return undefined
    try {
        return JSON.stringify(value).slice(0, 300)
    } catch {
        return String(value).slice(0, 300)
    }
}

function normalizeToolName(value: unknown): string {
    return String(value || 'tool')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

function compactToolName(value: unknown): string {
    return normalizeToolName(value).replace(/\s+/g, '')
}

function firstToolString(source: Record<string, unknown> | null, keys: string[]): string | null {
    if (!source) return null
    for (const key of keys) {
        const value = source[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    return null
}

function readManagedCommandJobId(
    args: Record<string, unknown> | null,
    result: Record<string, unknown> | null,
    partialResult: unknown
): string | null {
    const partialRecord = asRecord(partialResult)
    const resultDetails = asRecord(result?.['details'])
    const partialDetails = asRecord(partialRecord?.['details'])
    const direct = firstToolString(args, ['jobId', 'job_id'])
        || firstToolString(result, ['jobId', 'job_id'])
        || firstToolString(resultDetails, ['jobId', 'job_id'])
        || firstToolString(partialRecord, ['jobId', 'job_id'])
        || firstToolString(partialDetails, ['jobId', 'job_id'])
    return direct
}

type ManagedCommandLifecycleStatus = 'running' | 'completed' | 'failed' | 'stopped'

function normalizeManagedCommandLifecycleStatus(value: unknown): ManagedCommandLifecycleStatus | null {
    const normalized = String(value || '').trim().toLowerCase().replace(/[-_\s]/g, '')
    if (normalized === 'running' || normalized === 'inprogress' || normalized === 'pending' || normalized === 'started') return 'running'
    if (normalized === 'complete' || normalized === 'completed' || normalized === 'success' || normalized === 'succeeded') return 'completed'
    if (normalized === 'error' || normalized === 'failed') return 'failed'
    if (normalized === 'stopped' || normalized === 'aborted' || normalized === 'interrupted' || normalized === 'cancelled') return 'stopped'
    return null
}

function readManagedCommandLifecycleStatus(
    result: Record<string, unknown> | null,
    partialResult: unknown
): ManagedCommandLifecycleStatus | null {
    const partialRecord = asRecord(partialResult)
    const resultDetails = asRecord(result?.['details'])
    const partialDetails = asRecord(partialRecord?.['details'])
    for (const value of [
        resultDetails?.['status'],
        result?.['status'],
        partialDetails?.['status'],
        partialRecord?.['status']
    ]) {
        const status = normalizeManagedCommandLifecycleStatus(value)
        if (status) return status
    }
    return null
}

function isManagedCommandCheckpointCall(
    toolName: string,
    args: Record<string, unknown> | null,
    result: Record<string, unknown> | null,
    partialResult: unknown
): boolean {
    const jobId = readManagedCommandJobId(args, result, partialResult)
    const directCommand = firstToolString(args, ['command', 'cmd', 'script'])
    const action = firstToolString(args, ['action'])
        || (compactToolName(toolName) === 'bash' && jobId && !directCommand ? 'status' : null)
    return compactToolName(toolName) === 'bash' && Boolean(jobId) && /^(status|stop)$/i.test(action || '')
}

function managedCommandSummary(status: ManagedCommandLifecycleStatus): string {
    if (status === 'running') return 'Running command'
    if (status === 'failed') return 'Command failed'
    if (status === 'stopped') return 'Stopped command'
    return 'Ran command'
}

function readToolStringArray(value: unknown): string[] {
    if (typeof value === 'string' && value.trim()) return [value]
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function readPathsFromChanges(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
        const change = asRecord(entry)
        if (!change) return []
        const kind = asRecord(change['kind'])
        return [
            firstToolString(change, ['path', 'filePath', 'file_path']),
            firstToolString(change, ['previousPath', 'previous_path', 'movePath', 'move_path']),
            firstToolString(kind, ['movePath', 'move_path'])
        ].filter((path): path is string => Boolean(path))
    })
}

function readToolPaths(
    args: Record<string, unknown> | null,
    result: Record<string, unknown> | null,
    partialResult?: unknown
): string[] {
    const resultDetails = asRecord(result?.['details'])
    const partialRecord = asRecord(partialResult)
    const partialDetails = asRecord(partialRecord?.['details'])
    const candidates = [
        ...readToolStringArray(args?.['paths']),
        ...readToolStringArray(args?.['files']),
        ...readToolStringArray(result?.['paths']),
        ...readToolStringArray(result?.['files']),
        ...readToolStringArray(resultDetails?.['paths']),
        ...readToolStringArray(resultDetails?.['files']),
        ...readToolStringArray(partialDetails?.['paths']),
        ...readToolStringArray(partialDetails?.['files']),
        ...readPathsFromChanges(resultDetails?.['changes']),
        ...readPathsFromChanges(partialDetails?.['changes'])
    ]
    const records = [args, result, resultDetails, partialRecord, partialDetails]
    for (const record of records) {
        const path = firstToolString(record, ['path', 'filePath', 'file_path', 'targetPath', 'target_path'])
        if (path) candidates.unshift(path)
    }
    return [...new Set(candidates.map((entry) => entry.trim()).filter(Boolean))]
}

function readToolOutput(result: unknown, partialResult: unknown): string | undefined {
    if (typeof result === 'string' && result.trim()) return result
    if (typeof partialResult === 'string' && partialResult.trim()) return partialResult
    const resultRecord = asRecord(result)
    const partialRecord = asRecord(partialResult)
    const content = Array.isArray(resultRecord?.['content'])
        ? resultRecord?.['content']
        : Array.isArray(partialRecord?.['content'])
            ? partialRecord?.['content']
            : []
    const contentText = content
        .map((entry) => asRecord(entry)?.['text'])
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .join('\n')
        .trim()
    if (contentText) return contentText
    return firstToolString(resultRecord, ['output', 'stdout', 'text', 'message'])
        || firstToolString(partialRecord, ['output', 'stdout', 'text', 'message'])
        || summarizeValue(partialResult)
        || summarizeValue(result)
}

function isFileMutationTool(toolName: string, args: Record<string, unknown> | null): boolean {
    const normalized = normalizeToolName(toolName)
    if (/\b(edit|write|patch|replace|append|create|delete|move|rename)\b/.test(normalized) && !/\bthread\b/.test(normalized)) return true
    return Boolean(firstToolString(args, [
        'oldString',
        'old_string',
        'newString',
        'new_string',
        'oldStr',
        'old_str',
        'newStr',
        'new_str',
        'content',
        'fileContent',
        'file_content',
        'patch',
        'diff'
    ]))
}

function getPatchStats(patch: string | null): { additions: number; deletions: number } | null {
    if (!patch) return null
    const lines = patch.split(/\r?\n/)
    const additions = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length
    const deletions = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length
    return additions || deletions ? { additions, deletions } : null
}

function patchPath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function prefixPatchLines(value: string, prefix: '+' | '-'): string {
    return value.replace(/\r\n/g, '\n').split('\n').map((line) => `${prefix}${line}`).join('\n')
}

function buildArgumentPreviewPatch(toolName: string, args: Record<string, unknown> | null): string | null {
    const path = firstToolString(args, ['path', 'filePath', 'file_path', 'targetPath', 'target_path'])
    if (!path) return null
    const normalizedPath = patchPath(path)
    const oldText = firstToolString(args, ['oldString', 'old_string', 'oldText', 'old_text', 'oldStr', 'old_str', 'from', 'before'])
    const newText = firstToolString(args, ['newString', 'new_string', 'newText', 'new_text', 'newStr', 'new_str', 'to', 'after'])
    if (oldText !== null && newText !== null) {
        const oldLines = oldText.replace(/\r\n/g, '\n').split('\n').length
        const newLines = newText.replace(/\r\n/g, '\n').split('\n').length
        return [
            `--- a/${normalizedPath}`,
            `+++ b/${normalizedPath}`,
            `@@ -1,${oldLines} +1,${newLines} @@`,
            prefixPatchLines(oldText, '-'),
            prefixPatchLines(newText, '+')
        ].join('\n')
    }
    const content = firstToolString(args, ['content', 'fileContent', 'file_content', 'text', 'body'])
    if (content === null) return firstToolString(args, ['patch', 'diff'])
    const lines = content.replace(/\r\n/g, '\n').split('\n').length
    return [
        '--- /dev/null',
        `+++ b/${normalizedPath}`,
        `@@ -0,0 +1,${lines} @@`,
        prefixPatchLines(content, '+')
    ].join('\n')
}

function readPiFileChangeData(input: {
    cwd: string
    toolName: string
    args: Record<string, unknown> | null
    result: Record<string, unknown> | null
    partialResult: unknown
    type: string
    state: 'running' | 'completed' | 'error'
}): Record<string, unknown> {
    const { cwd, toolName, args, result, partialResult, type, state } = input
    const resultDetails = asRecord(result?.['details'])
    const partialRecord = asRecord(partialResult)
    const partialDetails = asRecord(partialRecord?.['details'])
    const details = resultDetails || partialDetails
    const resultPatch = firstToolString(resultDetails, ['patch'])
        || firstToolString(partialDetails, ['patch'])
    const resultDiff = firstToolString(resultDetails, ['diff'])
        || firstToolString(partialDetails, ['diff'])
    const explicitPatch = firstToolString(args, ['patch', 'diff'])
    const previewPatch = buildArgumentPreviewPatch(toolName, args) || explicitPatch
    const paths = readToolPaths(args, result, partialResult)
    const path = paths[0]
    const normalizedTool = normalizeToolName(toolName)
    const detailsSource = firstToolString(details, ['source'])
    const syntheticSnapshot = detailsSource === 'synthetic-snapshot' && Boolean(resultPatch || resultDiff)
        || details?.['snapshotBacked'] === true && Boolean(resultPatch || resultDiff)
    const unavailableReason = firstToolString(details, ['diffUnavailableReason', 'diff_unavailable_reason'])
    const hasProviderResult = Boolean(resultPatch || resultDiff)
    const source = syntheticSnapshot
        ? 'synthetic-snapshot'
        : hasProviderResult && type === 'tool_execution_end'
            ? 'provider-result'
            : hasProviderResult
                ? 'provider-live'
                : 'args-preview'
    const canonicalPatch = source === 'provider-result' || source === 'synthetic-snapshot'
        ? resultPatch || resultDiff
        : source === 'provider-live'
            ? resultPatch || resultDiff
            : undefined
    const writeExisting = Boolean(path && /\bwrite\b/.test(normalizedTool) && existsSync(isAbsolute(path) ? path : resolve(cwd, path)))
    const kind = /\b(delete|remove)\b/.test(normalizedTool)
        ? 'delete'
        : /\b(move|rename)\b/.test(normalizedTool)
            ? 'move'
            : /\b(write|create)\b/.test(normalizedTool) && !writeExisting
                ? 'add'
                : 'update'
    const changes = Array.isArray(details?.['changes'])
        ? details?.['changes']
        : path
            ? [{ path, kind, diff: canonicalPatch || previewPatch, isNew: kind === 'add' }]
            : []
    return {
        category: 'file-change',
        provider: 'pi',
        status: state === 'error' ? 'failed' : state,
        toolName,
        source,
        revision: type === 'tool_execution_start' ? 1 : type === 'tool_execution_update' ? 2 : 3,
        authoritative: state !== 'error' && (source === 'provider-result' || source === 'synthetic-snapshot'),
        changes,
        paths,
        createdPaths: kind === 'add' ? paths : [],
        fileCount: paths.length || undefined,
        patch: canonicalPatch || undefined,
        previewPatch: previewPatch || undefined,
        displayDiff: resultDiff || undefined,
        diffUnavailableReason: canonicalPatch
            ? undefined
            : unavailableReason
                || (/\bwrite\b/.test(normalizedTool) && writeExisting ? 'preview-only' : undefined),
        snapshotBacked: syntheticSnapshot || undefined,
        truncated: details?.['truncated'] === true || undefined
    }
}

function classifyZyraToolActivity(input: {
    toolName: string
    args: Record<string, unknown> | null
    result: Record<string, unknown> | null
    partialResult: unknown
    state: 'running' | 'completed' | 'error'
    output?: string
}): {
    kind: string
    summary: string
    detail?: string
    data: Record<string, unknown>
} {
    const { toolName, args, result, partialResult, state, output } = input
    const normalized = normalizeToolName(toolName)
    const compact = compactToolName(toolName)
    const running = state === 'running'
    const failed = state === 'error'
    const paths = readToolPaths(args, result, partialResult)
    const directCommand = firstToolString(args, ['command', 'cmd', 'script'])
    const shellJobId = readManagedCommandJobId(args, result, partialResult)
    const shellAction = firstToolString(args, ['action'])
        || (compact === 'bash' && shellJobId && !directCommand ? 'status' : null)
    const isShellTool = /\b(bash|shell|powershell|terminal|exec|command)\b/.test(normalized)
    const isManagedCommandCheckpoint = compact === 'bash' && Boolean(shellJobId) && /^(status|stop)$/i.test(shellAction || '')
    const command = directCommand || (
        isShellTool && shellAction
            ? [toolName, shellAction, shellJobId].filter(Boolean).join(' ')
            : null
    )
    const query = firstToolString(args, ['query', 'q', 'pattern', 'search'])
    const prompt = firstToolString(args, ['prompt', 'message', 'input'])
    const patch = firstToolString(args, ['patch', 'diff'])
    const patchStats = getPatchStats(patch)
    const baseData: Record<string, unknown> = {
        status: state,
        toolName,
        args: args || undefined,
        result: result || partialResult || undefined,
        output
    }

    if (isManagedCommandCheckpoint) {
        const action = shellAction!.toLowerCase()
        return {
            kind: 'command.checkpoint',
            summary: action === 'stop'
                ? (running ? 'Stopping command' : failed ? 'Could not stop command' : 'Stopped command')
                : (running ? 'Checking command' : failed ? 'Could not check command' : 'Checked command'),
            detail: shellJobId || undefined,
            data: {
                ...baseData,
                category: 'command-checkpoint',
                commandAction: action,
                jobId: shellJobId
            }
        }
    }

    if (compact.includes('spawnagent') || compact.includes('sendinput') || compact.includes('resumeagent') || compact === 'wait' || compact.includes('waitagent') || compact.includes('closeagent')) {
        const kindMap: Array<[boolean, string, string, string | undefined]> = [
            [compact.includes('spawnagent'), 'subagent.spawn', running ? 'Spawning subagent' : failed ? 'Failed to spawn subagent' : 'Spawned subagent', prompt || undefined],
            [compact.includes('sendinput'), 'subagent.send-input', running ? 'Checking in with subagent' : failed ? 'Failed subagent check-in' : 'Checked in with subagent', prompt || undefined],
            [compact.includes('resumeagent'), 'subagent.resume', running ? 'Resuming subagent' : failed ? 'Failed to resume subagent' : 'Resumed subagent', prompt || undefined],
            [compact === 'wait' || compact.includes('waitagent'), 'subagent.wait', running ? 'Waiting on subagent' : failed ? 'Subagent wait failed' : 'Subagent wait completed', undefined],
            [compact.includes('closeagent'), 'subagent.close', running ? 'Closing subagent' : failed ? 'Failed to close subagent' : 'Closed subagent', undefined]
        ]
        const match = kindMap.find(([enabled]) => enabled)
        if (match) {
            return {
                kind: match[1],
                summary: match[2],
                detail: match[3] || output || undefined,
                data: {
                    ...baseData,
                    category: 'subagent',
                    tool: toolName,
                    prompt: prompt || undefined,
                    receiverThreadIds: readToolStringArray(result?.['receiverThreadIds'] || args?.['receiverThreadIds']),
                    model: firstToolString(args, ['model']),
                    reasoningEffort: firstToolString(args, ['reasoningEffort', 'reasoning_effort'])
                }
            }
        }
    }

    if (command || isShellTool) {
        return {
            kind: 'command',
            summary: running ? 'Running command' : failed ? 'Command failed' : 'Ran command',
            detail: command || output || toolName,
            data: {
                ...baseData,
                command: command || toolName,
                jobId: shellJobId || undefined
            }
        }
    }

    if (isFileMutationTool(toolName, args)) {
        return {
            kind: 'file-change',
            summary: running ? 'Editing files' : failed ? 'File edit failed' : (paths.length > 1 ? 'Edited files' : 'Edited file'),
            detail: paths.length > 0 ? paths.join('\n') : firstToolString(args, ['path', 'filePath', 'file_path']) || output || toolName,
            data: {
                ...sanitizeFileChangeRawPayload(baseData),
                category: 'file-change',
                paths,
                createdPaths: paths.filter((entry) => /\b(create|write)\b/i.test(toolName)),
                fileCount: paths.length || undefined,
                patch: patch || undefined,
                additions: patchStats?.additions,
                deletions: patchStats?.deletions
            }
        }
    }

    if (paths.length > 0 || /\b(read|open|cat|view|inspect)\b/.test(normalized)) {
        return {
            kind: 'file-read',
            summary: running ? 'Reading file' : failed ? 'File read failed' : (paths.length > 1 ? 'Read files' : 'Read file'),
            detail: paths.length > 0 ? paths.join('\n') : output || toolName,
            data: {
                ...baseData,
                paths,
                fileCount: paths.length || undefined
            }
        }
    }

    if (query || /\b(search|find|grep|rg|web)\b/.test(normalized)) {
        return {
            kind: 'search',
            summary: running ? 'Searching' : failed ? 'Search failed' : 'Searched',
            detail: query || output || toolName,
            data: {
                ...baseData,
                query: query || undefined
            }
        }
    }

    return {
        kind: 'tool',
        summary: `${running ? 'Using' : failed ? 'Failed' : 'Used'} ${toolName}`,
        detail: summarizeValue(args) || output,
        data: baseData
    }
}

function normalizeZyraModel(model: string | undefined): string | undefined {
    if (!model) return undefined
    if (model.includes('/')) return model
    if (model.startsWith('gpt-') || model.startsWith('o')) return `openai-codex/${model}`
    return model
}

function normalizeZyraProfile(profile: unknown): string {
    const normalized = typeof profile === 'string' ? profile.trim().toLowerCase() : ''
    return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : 'default'
}

function fallbackZyraModels(): AssistantModelInfo[] {
    return [
        { id: 'openai-codex/gpt-5.5', label: 'gpt-5.5', description: 'openai-codex' },
        { id: 'openai-codex/gpt-5.4', label: 'gpt-5.4', description: 'openai-codex' },
        { id: 'openai-codex/gpt-5.4-mini', label: 'gpt-5.4-mini', description: 'openai-codex' },
        { id: 'openai-codex/gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'openai-codex' },
        { id: 'openai-codex/gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark', description: 'openai-codex' }
    ].map((model) => ({ ...model, supportedEfforts: getAssistantModelReasoningEfforts(model) }))
}

function normalizeModelInfo(value: unknown): AssistantModelInfo | null {
    const record = asRecord(value)
    const id = asString(record?.['id'])
    if (!id) return null
    const label = asString(record?.['label']) || id
    const description = asString(record?.['description']) || undefined
    const supportedEfforts = Array.isArray(record?.['supportedEfforts'])
        ? record.supportedEfforts.filter(isAssistantReasoningEffort)
        : getAssistantModelReasoningEfforts({ id, label })
    return { id, label, description, supportedEfforts }
}

function resolveBridgePath(root = resolveZyraRoot()): string {
    return join(root, 'src', 'zyra-ui-bridge.mjs')
}

function resolveNodeLaunch(): NodeLaunch {
    const explicitNode = [
        process.env.ZYRA_NODE_BINARY,
        process.env.ZYRA_AGENT_NODE,
        process.env.npm_node_execpath,
        process.env.NODE_BINARY
    ].find((candidate): candidate is string => Boolean(candidate?.trim()))
    if (explicitNode) {
        return { command: explicitNode, env: {} }
    }

    if (process.versions.electron) {
        return {
            command: process.execPath,
            env: { ELECTRON_RUN_AS_NODE: '1' }
        }
    }

    return { command: process.execPath || (process.platform === 'win32' ? 'node.exe' : 'node'), env: {} }
}

function checkNodeLaunch(launch = resolveNodeLaunch()): string | null {
    const result = spawnSync(launch.command, ['--version'], {
        env: {
            ...process.env,
            ...launch.env
        },
        encoding: 'utf8',
        windowsHide: true
    })
    if (!result.error && result.status === 0) return null
    return result.error?.message || result.stderr?.trim() || `Node launch failed with status ${result.status}`
}

class ZyraPiWorker {
    private child: ChildProcessWithoutNullStreams | null = null
    private lines: ReadlineInterface | null = null
    private nextId = 1
    private readonly pending = new Map<number, PendingBridgeRequest>()
    private readonly eventListeners = new Set<(event: unknown) => void>()
    private readonly controlAbortControllers = new Map<string, AbortController>()
    private controlRequestHandler: ((operation: unknown, signal: AbortSignal) => Promise<Record<string, unknown>>) | null = null
    private disposed = false

    constructor(
        private readonly root: string,
        private readonly bridgePath: string,
        private readonly cwd: string
    ) {}

    onEvent(listener: (event: unknown) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    setControlRequestHandler(handler: (operation: unknown, signal: AbortSignal) => Promise<Record<string, unknown>>): void {
        this.controlRequestHandler = handler
    }

    isAlive(): boolean {
        return Boolean(
            !this.disposed
            && this.child
            && this.child.exitCode === null
            && !this.child.killed
            && this.child.stdin.writable
        )
    }

    request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        this.ensureStarted()
        if (!this.child?.stdin.writable) {
            return Promise.reject(new Error('Zyra bridge stdin is closed.'))
        }
        const id = this.nextId++
        return new Promise((resolveRequest, rejectRequest) => {
            this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
            this.child!.stdin.write(`${JSON.stringify({ id, type, payload })}\n`, (error) => {
                if (!error) return
                this.pending.delete(id)
                rejectRequest(error)
            })
        })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        if (this.child?.stdin.writable) {
            this.child.stdin.write(`${JSON.stringify({ id: this.nextId++, type: 'dispose', payload: {} })}\n`)
        }
        this.lines?.close()
        this.child?.kill()
        this.child = null
        for (const controller of this.controlAbortControllers.values()) controller.abort()
        this.controlAbortControllers.clear()
        this.rejectPending(new Error('Zyra bridge disposed.'))
    }

    private ensureStarted(): void {
        if (this.child) return
        const nodeLaunch = resolveNodeLaunch()
        this.child = spawn(nodeLaunch.command, [this.bridgePath], {
            cwd: this.root,
            env: {
                ...process.env,
                ...nodeLaunch.env,
                ZYRA_ROOT: this.root,
                ZYRA_CALLER_CWD: this.cwd
            },
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        })
        this.child.stdout.setEncoding('utf8')
        this.child.stderr.setEncoding('utf8')
        this.lines = createInterface({ input: this.child.stdout })
        this.lines.on('line', (line) => this.handleLine(line))
        this.child.stderr.on('data', (chunk) => {
            const text = String(chunk).trim()
            if (text) log.warn('[ZyraPiRuntime] bridge stderr', text)
        })
        this.child.on('error', (error) => {
            this.rejectPending(error)
        })
        this.child.on('exit', (code, signal) => {
            const message = this.disposed
                ? 'Zyra bridge stopped.'
                : `Zyra bridge exited${code === null ? '' : ` with code ${code}`}${signal ? ` signal ${signal}` : ''}.`
            this.child = null
            this.rejectPending(new Error(message))
        })
    }

    private handleLine(line: string): void {
        let message: BridgeMessage
        try {
            message = JSON.parse(line) as BridgeMessage
        } catch {
            log.warn('[ZyraPiRuntime] bridge stdout', line)
            return
        }
        if (message.type === 'event') {
            for (const listener of this.eventListeners) listener(message.event)
            return
        }
        if (message.type === 'control.cancel' && message.requestId) {
            this.controlAbortControllers.get(message.requestId)?.abort()
            return
        }
        if (message.type === 'control.request' && message.requestId) {
            void this.handleControlRequest(message.requestId, message.operation)
            return
        }
        if (message.type === 'protocol_error') {
            log.error('[ZyraPiRuntime] bridge protocol error', message.error)
            return
        }
        if (message.type !== 'response' || typeof message.id !== 'number') return
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.ok) {
            pending.resolve(message.result || {})
            return
        }
        const error = new Error(message.error || 'Zyra bridge request failed.')
        if (message.stack) error.stack = message.stack
        pending.reject(error)
    }

    private async handleControlRequest(requestId: string, operation: unknown): Promise<void> {
        if (!this.child?.stdin.writable) return
        const controller = new AbortController()
        this.controlAbortControllers.set(requestId, controller)
        try {
            if (!this.controlRequestHandler) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Desktop control authority is not bound to this worker.')
            const result = await this.controlRequestHandler(operation, controller.signal)
            this.child?.stdin.write(`${JSON.stringify({ type: 'control.response', requestId, ok: true, result })}\n`)
        } catch (error) {
            const controlError = toAgentControlError(error)
            this.child?.stdin.write(`${JSON.stringify({ type: 'control.response', requestId, ok: false, error: controlError.toWire() })}\n`)
        } finally {
            this.controlAbortControllers.delete(requestId)
        }
    }

    private rejectPending(error: Error): void {
        for (const controller of this.controlAbortControllers.values()) controller.abort()
        this.controlAbortControllers.clear()
        for (const pending of this.pending.values()) {
            pending.reject(error)
        }
        this.pending.clear()
    }
}

export class ZyraPiRuntime extends EventEmitter {
    private readonly sessions = new Map<string, ZyraSessionContext>()
    private readonly aliases = new Map<string, string>()
    private warmWorker: ZyraPiWorker | null = null
    private warmPromise: Promise<AssistantModelInfo[]> | null = null
    private warmWorkerKey: string | null = null
    private modelCache: AssistantModelInfo[] = []

    async checkAvailability(): Promise<{ available: boolean; reason: string | null }> {
        const root = resolveZyraRoot()
        const sdkPath = join(root, 'src', 'zyra-sdk.mjs')
        if (!existsSync(sdkPath)) {
            return { available: false, reason: `Zyra SDK not found at ${sdkPath}` }
        }
        const bridgePath = resolveBridgePath(root)
        if (!existsSync(bridgePath)) {
            return { available: false, reason: `Zyra UI bridge not found at ${bridgePath}` }
        }
        const nodeLaunchError = checkNodeLaunch()
        if (nodeLaunchError) {
            return { available: false, reason: `Node runtime for Zyra bridge is unavailable: ${nodeLaunchError}` }
        }
        return { available: true, reason: null }
    }

    async listModels(forceRefresh = false): Promise<AssistantModelInfo[]> {
        const availability = await this.checkAvailability()
        if (!availability.available) return fallbackZyraModels()

        try {
            const models = await this.prewarm(forceRefresh)
            return models.length > 0 ? models : fallbackZyraModels()
        } catch (error) {
            log.warn('[ZyraPiRuntime] failed to list Pi models', error)
            return fallbackZyraModels()
        }
    }

    async prewarm(forceRefresh = false): Promise<AssistantModelInfo[]> {
        const availability = await this.checkAvailability()
        if (!availability.available) return fallbackZyraModels()
        return this.ensureWarmWorker(resolveZyraRoot(), forceRefresh)
    }

    async generateText(
        prompt: string,
        options: { cwd: string; model?: string; effort?: 'low' }
    ): Promise<{ success: boolean; text?: string; model?: string; error?: string }> {
        const normalizedPrompt = String(prompt || '').trim()
        if (!normalizedPrompt) return { success: false, error: 'Prompt is required.' }

        const availability = await this.checkAvailability()
        if (!availability.available) {
            return { success: false, error: availability.reason || 'Zyra Pi runtime is unavailable.' }
        }

        const root = resolveZyraRoot()
        const worker = new ZyraPiWorker(root, resolveBridgePath(root), options.cwd)
        try {
            const result = await worker.request('generate_text', {
                prompt: normalizedPrompt,
                cwd: options.cwd,
                model: normalizeZyraModel(options.model),
                thinking: options.effort || 'low'
            })
            const text = asString(result['text'])
            if (!text) return { success: false, error: 'Zyra returned an empty title.' }
            return {
                success: true,
                text,
                model: asString(result['model']) || normalizeZyraModel(options.model)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Zyra title generation failed.'
            log.warn('[ZyraPiRuntime] background text generation failed', message)
            return { success: false, error: message }
        } finally {
            worker.dispose()
        }
    }

    async getAccount(): Promise<{ account: AssistantAccountIdentity | null; authMode: 'apikey' | 'chatgpt' | 'chatgptAuthTokens' | null; requiresOpenaiAuth: boolean }> {
        return {
            account: null,
            authMode: null,
            requiresOpenaiAuth: false
        }
    }

    async getAccountRateLimits(): Promise<{
        rateLimits: AssistantRateLimitSnapshot | null
        rateLimitsByLimitId: Record<string, AssistantRateLimitSnapshot>
    }> {
        return {
            rateLimits: null,
            rateLimitsByLimitId: {}
        }
    }

    async connect(thread: AssistantThread, cwd: string): Promise<void> {
        if (this.getSessionContext(thread.id) || (thread.providerThreadId && this.getSessionContext(thread.providerThreadId))) return

        const availability = await this.checkAvailability()
        if (!availability.available) {
            throw new Error(availability.reason || 'Zyra Pi runtime is unavailable.')
        }

        const root = resolveZyraRoot()
        const bridgePath = resolveBridgePath(root)
        const worker = await this.claimWarmWorker(root, bridgePath, cwd)
            || new ZyraPiWorker(root, bridgePath, cwd)
        const providerThreadId = getAssistantCanonicalThreadId(thread)
        const model = normalizeZyraModel(thread.model) || 'openai-codex/gpt-5.5'
        const context: ZyraSessionContext = {
            localThreadId: thread.id,
            providerThreadId,
            resumeProviderThreadId: thread.providerThreadId || null,
            worker,
            connected: false,
            connectPromise: null,
            cwd,
            model,
            thinking: 'medium',
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            profile: 'default',
            activeTurnId: null,
            assistantMessageSequence: 0,
            activeAssistantItemId: null,
            toolArgsByCallId: new Map(),
            toolStartedAtByCallId: new Map(),
            commandActivityIdByJobId: new Map(),
            assistantTextByItemId: new Map(),
            assistantCompletedItemIds: new Set(),
            internalTextByItemId: new Map(),
            internalCompletedItemIds: new Set(),
            activeCompaction: null,
            lastAssistantItemId: null,
            lastUsage: null
        }
        worker.setControlRequestHandler(async (operation, signal) => {
            const turnId = context.activeTurnId
            if (!turnId) throw new AgentControlError('CONTROL_PRINCIPAL_MISMATCH', 'Control tools require an active root turn.')
            return getAgentControlBroker().handleToolOperation({
                type: 'root',
                threadId: context.localThreadId,
                turnId
            }, operation, signal)
        })
        context.unsubscribe = worker.onEvent((event) => this.handleZyraEvent(context, event))
        this.sessions.set(thread.id, context)
        this.sessions.set(providerThreadId, context)
        this.aliases.set(providerThreadId, thread.id)
        this.aliases.set(thread.id, thread.id)

        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.started',
            createdAt: nowIso(),
            threadId: thread.id,
            payload: {
                cwd,
                model,
                runtimeMode: thread.runtimeMode,
                interactionMode: thread.interactionMode,
                profile: context.profile
            }
        })
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'thread.started',
            createdAt: nowIso(),
            threadId: thread.id,
            providerThreadId,
            payload: { providerThreadId, cwd, state: 'ready' }
        })
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.state.changed',
            createdAt: nowIso(),
            threadId: thread.id,
            providerThreadId,
            payload: { state: 'ready' }
        })
    }

    hasSession(threadId: string): boolean {
        return Boolean(this.getSessionContext(threadId))
    }

    async sendPrompt(
        threadId: string,
        prompt: string,
        options?: {
            model?: string
            runtimeMode?: AssistantRuntimeMode
            interactionMode?: AssistantInteractionMode
            effort?: AssistantReasoningEffort
            serviceTier?: 'fast'
            profile?: string
            images?: PreparedAssistantPromptImage[]
        }
    ): Promise<{ turnId: string; providerThreadId: string | null }> {
        const context = this.requireSession(threadId)
        if (context.activeTurnId) {
            throw new Error('Zyra is already working in this thread.')
        }

        const turnId = randomUUID()
        context.activeTurnId = turnId
        context.assistantMessageSequence = 0
        context.activeAssistantItemId = null
        context.toolArgsByCallId.clear()
        context.toolStartedAtByCallId.clear()
        context.assistantTextByItemId.clear()
        context.assistantCompletedItemIds.clear()
        context.internalTextByItemId.clear()
        context.internalCompletedItemIds.clear()
        context.lastAssistantItemId = null
        context.lastUsage = null
        context.model = normalizeZyraModel(options?.model) || context.model
        context.thinking = options?.effort || context.thinking
        context.runtimeMode = options?.runtimeMode || context.runtimeMode
        context.interactionMode = options?.interactionMode || context.interactionMode
        context.profile = normalizeZyraProfile(options?.profile || context.profile)

        this.emitRuntime({
            eventId: randomUUID(),
            type: 'turn.started',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId,
            payload: {
                model: context.model,
                interactionMode: context.interactionMode,
                profile: context.profile,
                effort: options?.effort,
                serviceTier: options?.serviceTier
            }
        })

        void this.runPromptTurn(context, turnId, prompt, options)
        return { turnId, providerThreadId: context.providerThreadId }
    }

    async requestFleetOperation(threadId: string, namespace: 'agents' | 'workflows', action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        const context = this.requireSession(threadId)
        await this.ensureConnected(context)
        return context.worker.request(`${namespace}.${action}`, payload)
    }

    async interruptTurn(threadId: string): Promise<void> {
        const context = this.requireSession(threadId)
        if (context.activeTurnId) {
            getAgentControlBroker().revokePrincipal({ type: 'root', threadId: context.localThreadId, turnId: context.activeTurnId })
        }
        await context.worker.request('abort').catch((error) => {
            log.warn('[ZyraPiRuntime] bridge abort failed', error)
        })
        if (!context.activeTurnId) return
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'turn.completed',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId: context.activeTurnId,
            payload: { outcome: 'interrupted' }
        })
        context.activeTurnId = null
    }

    async rollbackThread(): Promise<void> {
        return
    }

    async respondApproval(_threadId: string, _requestId: string, _decision: AssistantApprovalDecision): Promise<void> {
        return
    }

    async respondUserInput(_threadId: string, _requestId: string, _answers: Record<string, string | string[]>): Promise<void> {
        return
    }

    disconnect(threadId: string): void {
        const context = this.getSessionContext(threadId)
        if (!context) return
        this.sessions.delete(context.localThreadId)
        this.sessions.delete(context.providerThreadId)
        this.aliases.delete(context.localThreadId)
        this.aliases.delete(context.providerThreadId)
        if (typeof context.unsubscribe === 'function') {
            context.unsubscribe()
        }
        context.worker.dispose()
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.state.changed',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            payload: { state: 'stopped', message: 'Zyra session disconnected.' }
        })
    }

    dispose(): void {
        for (const threadId of [...this.sessions.keys()]) {
            this.disconnect(threadId)
        }
        this.disposeWarmWorker()
    }

    private async ensureWarmWorker(root: string, forceRefresh = false): Promise<AssistantModelInfo[]> {
        const bridgePath = resolveBridgePath(root)
        const key = `${root}|${bridgePath}`
        if (!this.warmWorker || this.warmWorkerKey !== key) {
            this.disposeWarmWorker()
            this.warmWorker = new ZyraPiWorker(root, bridgePath, root)
            this.warmWorkerKey = key
        }
        if (this.warmPromise && !forceRefresh) return this.warmPromise

        const worker = this.warmWorker
        this.warmPromise = worker.request('warmup', { forceRefresh })
            .then((result) => {
                const models = Array.isArray(result['models'])
                    ? result['models'].map(normalizeModelInfo).filter((model): model is AssistantModelInfo => Boolean(model))
                    : []
                if (models.length > 0) this.modelCache = models
                return models.length > 0 ? models : this.modelCache
            })
            .catch((error) => {
                if (this.warmWorker === worker) this.disposeWarmWorker()
                throw error
            })
        return this.warmPromise
    }

    private async claimWarmWorker(
        root: string,
        bridgePath: string,
        _cwd: string
    ): Promise<ZyraPiWorker | null> {
        const key = `${root}|${bridgePath}`
        if (!this.warmWorker || this.warmWorkerKey !== key) return null
        const worker = this.warmWorker
        try {
            await this.warmPromise
        } catch {
            return null
        }
        if (this.warmWorker !== worker) return null
        this.warmWorker = null
        this.warmPromise = null
        this.warmWorkerKey = null
        void this.ensureWarmWorker(root, false).catch((error) => {
            log.warn('[ZyraPiRuntime] replacement worker prewarm failed', error)
        })
        return worker
    }

    private disposeWarmWorker(): void {
        this.warmWorker?.dispose()
        this.warmWorker = null
        this.warmPromise = null
        this.warmWorkerKey = null
    }

    private async runPromptTurn(
        context: ZyraSessionContext,
        turnId: string,
        prompt: string,
        options?: {
            effort?: AssistantReasoningEffort
            serviceTier?: 'fast'
            images?: PreparedAssistantPromptImage[]
        }
    ): Promise<void> {
        try {
            await this.ensureConnected(context)
            await context.worker.request('prompt', {
                prompt,
                model: context.model,
                thinking: context.thinking,
                profile: context.profile,
                images: options?.images
            })
            if (context.activeTurnId !== turnId) return
            this.completeAssistantText(context, turnId)
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'turn.completed',
                createdAt: nowIso(),
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId,
                payload: {
                    outcome: 'completed',
                    effort: options?.effort,
                    serviceTier: options?.serviceTier,
                    usage: context.lastUsage
                }
            })
        } catch (error) {
            if (context.activeTurnId !== turnId) return
            const message = error instanceof Error ? error.message : 'Zyra prompt failed.'
            if (isExpectedBridgeDisposalError(error)) {
                if (context.activeTurnId === turnId) context.activeTurnId = null
                log.info('[ZyraPiRuntime] prompt interrupted by bridge disposal')
                this.emitRuntime({
                    eventId: randomUUID(),
                    type: 'turn.completed',
                    createdAt: nowIso(),
                    threadId: context.localThreadId,
                    providerThreadId: context.providerThreadId,
                    turnId,
                    payload: { outcome: 'interrupted' }
                })
                return
            }
            log.error('[ZyraPiRuntime] prompt failed', error)
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'turn.completed',
                createdAt: nowIso(),
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId,
                payload: {
                    outcome: 'failed',
                    errorMessage: message
                }
            })
            const sessionState = context.connected && context.worker.isAlive() ? 'ready' : 'error'
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'session.state.changed',
                createdAt: nowIso(),
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId,
                payload: { state: sessionState, error: message, message }
            })
        } finally {
            if (context.activeTurnId === turnId) {
                context.activeTurnId = null
            }
        }
    }

    private async ensureConnected(context: ZyraSessionContext): Promise<void> {
        if (context.connected) return
        if (context.connectPromise) return context.connectPromise

        context.connectPromise = (async () => {
            const shouldResumeProviderSession = Boolean(context.resumeProviderThreadId)
            const requestedThreadId = shouldResumeProviderSession ? context.resumeProviderThreadId || undefined : undefined
            const result = await context.worker.request('connect', {
                cwd: context.cwd,
                threadId: requestedThreadId,
                providerThreadId: requestedThreadId,
                noSession: false,
                model: context.model,
                thinking: context.thinking,
                profile: context.profile
            })
            const previousProviderThreadId = context.providerThreadId
            const providerThreadId = String(result['threadId'] || result['providerThreadId'] || context.resumeProviderThreadId || context.providerThreadId || randomUUID())
            const model = String(result['model'] || context.model)
            const profile = normalizeZyraProfile(result['profile'] || context.profile)
            context.providerThreadId = providerThreadId
            context.resumeProviderThreadId = providerThreadId
            context.model = model
            context.profile = profile
            context.connected = true
            const connectedFleet = asRecord(result['fleet']) as unknown as FleetSnapshot | null
            if (connectedFleet) {
                this.emitRuntime({
                    eventId: randomUUID(),
                    type: 'fleet.snapshot.updated',
                    createdAt: nowIso(),
                    threadId: context.localThreadId,
                    providerThreadId,
                    payload: { eventType: 'fleet_snapshot', event: { type: 'fleet_snapshot' }, snapshot: connectedFleet }
                })
            }
            this.sessions.set(context.localThreadId, context)
            this.sessions.set(providerThreadId, context)
            this.aliases.set(providerThreadId, context.localThreadId)
            this.aliases.set(context.localThreadId, context.localThreadId)
            if (
                previousProviderThreadId
                && previousProviderThreadId !== providerThreadId
                && previousProviderThreadId !== context.localThreadId
            ) {
                this.sessions.delete(previousProviderThreadId)
                this.aliases.delete(previousProviderThreadId)
            }
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'thread.started',
                createdAt: nowIso(),
                threadId: context.localThreadId,
                providerThreadId,
                payload: { providerThreadId, cwd: context.cwd, state: 'running' }
            })
        })()

        try {
            await context.connectPromise
        } catch (error) {
            context.connectPromise = null
            throw error
        }
    }

    private handleZyraEvent(context: ZyraSessionContext, eventValue: unknown): void {
        const event = asRecord(eventValue)
        if (!event) return
        const type = asString(event['type'])
        if (!type) return
        const turnId = context.activeTurnId

        if (type === 'fleet_snapshot' || type.startsWith('agent.') || type.startsWith('workflow.')) {
            const fleet = asRecord(event['fleet'] || event['fleetSnapshot']) as unknown as FleetSnapshot | null
            if (!fleet) return
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'fleet.snapshot.updated',
                createdAt: asString(event['timestamp']) || nowIso(),
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                payload: {
                    eventType: type,
                    event,
                    snapshot: fleet
                }
            })
            return
        }

        if (type === 'managed_bash_job_update') {
            this.emitManagedBashJobUpdate(context, event)
            return
        }

        if (type === 'message_start' || type === 'message_update' || type === 'message_end') {
            const message = asRecord(event['message'])
            if (message?.['role'] !== 'assistant' || !turnId) return
            const itemId = resolveAssistantEventItemId(context, event, turnId, type)
            const currentContent = {
                thinking: context.internalTextByItemId.get(itemId) || '',
                text: context.assistantTextByItemId.get(itemId) || '',
                hasThinkingBlock: context.internalTextByItemId.has(itemId)
            }
            const content = extractAssistantEventContentParts(event, currentContent)
            context.lastUsage = readUsage(message['usage']) || context.lastUsage
            if (hasAssistantThinkingText(content) || isReasoningOnlyAssistantEvent(event)) {
                this.streamInternalText(context, turnId, content.thinking || content.text, itemId)
            }
            if (hasAssistantContentText(content) && !isReasoningOnlyAssistantEvent(event)) {
                this.streamAssistantText(context, turnId, content.text, itemId)
            }
            if (type === 'message_end') {
                if (hasAssistantThinkingText(content) || isReasoningOnlyAssistantEvent(event)) {
                    this.completeInternalText(context, turnId, content.thinking || content.text, itemId)
                }
                if (hasAssistantContentText(content) && !isReasoningOnlyAssistantEvent(event)) {
                    this.completeAssistantText(context, turnId, content.text, itemId)
                }
                if (context.activeAssistantItemId === itemId) {
                    context.activeAssistantItemId = null
                }
            }
            return
        }

        if (type === 'tool_execution_start' || type === 'tool_execution_update' || type === 'tool_execution_end') {
            this.emitToolActivity(context, event, type)
            return
        }

        if (type === 'auto_retry_start') {
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'activity',
                createdAt: nowIso(),
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId: turnId || undefined,
                payload: {
                    kind: 'retry',
                    summary: 'Retrying provider request',
                    detail: asString(event['errorMessage']) || undefined,
                    tone: 'warning',
                    data: { attempt: event['attempt'], maxAttempts: event['maxAttempts'] }
                }
            })
            return
        }

        if (type === 'compaction_start') {
            const startedAt = nowIso()
            const reason = asString(event['reason']) || 'threshold'
            const lifecycle: ActiveCompactionLifecycle = {
                activityId: `zyra-context-compaction-${randomUUID()}`,
                startedAt,
                reason,
                turnId
            }
            context.activeCompaction = lifecycle
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'activity',
                createdAt: startedAt,
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId: turnId || undefined,
                payload: {
                    activityId: lifecycle.activityId,
                    kind: 'context.compaction',
                    summary: 'AUTO-COMPACTING',
                    detail: 'Conversation context is being compacted.',
                    tone: 'tool',
                    data: {
                        category: 'context-compaction',
                        sourceMethod: 'pi-sdk',
                        status: 'running',
                        reason,
                        startedAt
                    }
                }
            })
            return
        }

        if (type === 'compaction_end') {
            const completedAt = nowIso()
            const reason = asString(event['reason']) || context.activeCompaction?.reason || 'threshold'
            const lifecycle = context.activeCompaction || {
                activityId: `zyra-context-compaction-${randomUUID()}`,
                startedAt: completedAt,
                reason,
                turnId
            }
            const result = asRecord(event['result'])
            const aborted = event['aborted'] === true
            const errorMessage = asString(event['errorMessage'])
            const status = aborted ? 'cancelled' : result ? 'completed' : 'failed'
            const tone = status === 'failed' ? 'error' : status === 'cancelled' ? 'warning' : 'tool'
            const summary = status === 'completed'
                ? 'AUTO-COMPACTED'
                : status === 'cancelled'
                    ? 'AUTO-COMPACTION CANCELLED'
                    : 'AUTO-COMPACTION FAILED'
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'activity',
                createdAt: completedAt,
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId: lifecycle.turnId || undefined,
                payload: {
                    activityId: lifecycle.activityId,
                    kind: 'context.compaction',
                    summary,
                    detail: errorMessage
                        || (status === 'completed'
                            ? 'Conversation context was compacted.'
                            : status === 'cancelled'
                                ? 'Conversation context compaction was cancelled.'
                                : 'Conversation context could not be compacted.'),
                    tone,
                    data: {
                        category: 'context-compaction',
                        sourceMethod: 'pi-sdk',
                        status,
                        reason,
                        startedAt: lifecycle.startedAt,
                        completedAt,
                        aborted,
                        willRetry: event['willRetry'] === true,
                        firstKeptEntryId: asString(result?.['firstKeptEntryId']) || undefined,
                        tokensBefore: typeof result?.['tokensBefore'] === 'number' ? result['tokensBefore'] : undefined,
                        estimatedTokensAfter: typeof result?.['estimatedTokensAfter'] === 'number' ? result['estimatedTokensAfter'] : undefined,
                        errorMessage: errorMessage || undefined
                    }
                }
            })
            context.activeCompaction = null
            return
        }
    }

    private streamAssistantText(context: ZyraSessionContext, turnId: string, text: string, itemId = `zyra-assistant-${turnId}`): void {
        const previousText = context.assistantTextByItemId.get(itemId) || ''
        const nextText = text
        const delta = deltaFromMergedText(previousText, nextText)
        context.lastAssistantItemId = itemId
        context.assistantTextByItemId.set(itemId, nextText)
        if (!delta || (previousText && !nextText.startsWith(previousText))) return
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'content.delta',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId,
            itemId,
            payload: {
                streamKind: 'assistant_text',
                delta
            }
        })
    }

    private completeAssistantText(context: ZyraSessionContext, turnId: string, finalText?: string, itemId = context.lastAssistantItemId || `zyra-assistant-${turnId}`): void {
        const text = finalText ?? context.assistantTextByItemId.get(itemId) ?? ''
        if (context.assistantCompletedItemIds.has(itemId)) return
        context.lastAssistantItemId = itemId
        context.assistantCompletedItemIds.add(itemId)
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'content.completed',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId,
            itemId,
            payload: {
                streamKind: 'assistant_text',
                text
            }
        })
    }

    private streamInternalText(context: ZyraSessionContext, turnId: string, text: string, itemId = `zyra-internal-${turnId}`): void {
        const previousText = context.internalTextByItemId.get(itemId) || ''
        const nextText = text
        const delta = deltaFromMergedText(previousText, nextText)
        context.internalTextByItemId.set(itemId, nextText)
        if (!delta || (previousText && !nextText.startsWith(previousText))) return
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'content.delta',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId,
            itemId,
            payload: {
                streamKind: 'reasoning_summary_text',
                delta
            }
        })
    }

    private completeInternalText(context: ZyraSessionContext, turnId: string, finalText?: string, itemId = `zyra-internal-${turnId}`): void {
        const text = finalText ?? context.internalTextByItemId.get(itemId) ?? ''
        if (!text || context.internalCompletedItemIds.has(itemId)) return
        context.internalCompletedItemIds.add(itemId)
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'content.completed',
            createdAt: nowIso(),
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId,
            itemId,
            payload: {
                streamKind: 'reasoning_summary_text',
                text
            }
        })
    }

    private emitManagedBashJobUpdate(context: ZyraSessionContext, event: Record<string, unknown>): void {
        const status = normalizeManagedCommandLifecycleStatus(event['status'])
        const jobId = asString(event['jobId'])
        if (!status || !jobId) return
        const toolCallId = asString(event['toolCallId'])
        const activityId = toolCallId
            ? `zyra-tool-${toolCallId}`
            : context.commandActivityIdByJobId.get(jobId)
        if (!activityId) return
        context.commandActivityIdByJobId.set(jobId, activityId)

        const occurredAt = status === 'running'
            ? nowIso()
            : asString(event['completedAt']) || nowIso()
        const startedAt = asString(event['startedAt'])
        const completedAt = status === 'running' ? null : asString(event['completedAt']) || occurredAt
        const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN
        const completedAtMs = completedAt ? Date.parse(completedAt) : Number.NaN
        const durationMs = Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs)
            ? Math.max(0, completedAtMs - startedAtMs)
            : status === 'running' ? null : undefined
        const output = typeof event['output'] === 'string' ? event['output'] : undefined

        this.emitRuntime({
            eventId: randomUUID(),
            type: 'activity',
            createdAt: occurredAt,
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId: context.activeTurnId || undefined,
            itemId: toolCallId || undefined,
            payload: {
                activityId,
                kind: 'command',
                summary: managedCommandSummary(status),
                detail: asString(event['command']) || undefined,
                tone: status === 'failed' ? 'error' : status === 'stopped' ? 'warning' : 'tool',
                data: {
                    status,
                    toolName: 'bash',
                    jobId,
                    command: asString(event['command']) || undefined,
                    output,
                    replaceOutput: true,
                    startedAt: startedAt || undefined,
                    lastOutputAt: asString(event['lastOutputAt']) || undefined,
                    completedAt,
                    durationMs,
                    exitCode: event['exitCode'],
                    errorMessage: asString(event['errorMessage']) || undefined
                }
            }
        })
    }

    private emitToolActivity(context: ZyraSessionContext, event: Record<string, unknown>, type: string): void {
        const agentSurface = parseAgentSurfaceDescriptor(event['surface'])
        const toolName = agentSurface?.toolName || asString(event['toolName']) || asString(event['name']) || 'tool'
        const toolCallId = asString(event['toolCallId']) || asString(event['id']) || `${toolName}-${context.activeTurnId || 'turn'}`
        const isError = Boolean(event['isError'])
        const occurredAt = nowIso()
        const incomingArgs = asRecord(event['args']) || asRecord(event['arguments']) || asRecord(event['input'])
        if (incomingArgs) context.toolArgsByCallId.set(toolCallId, incomingArgs)
        const argsRecord = incomingArgs || context.toolArgsByCallId.get(toolCallId) || null
        const startedAt = context.toolStartedAtByCallId.get(toolCallId) || occurredAt
        if (!context.toolStartedAtByCallId.has(toolCallId)) context.toolStartedAtByCallId.set(toolCallId, startedAt)
        const resultRecord = asRecord(event['result'])
        const partialResult = event['partialResult'] ?? event['output']
        const managedCommandJobId = readManagedCommandJobId(argsRecord, resultRecord, partialResult)
        const isManagedBashCall = compactToolName(toolName) === 'bash' && Boolean(managedCommandJobId)
        const managedCommandStatus = isManagedBashCall
            ? readManagedCommandLifecycleStatus(resultRecord, partialResult)
            : null
        const lifecycleStatus = isError ? 'failed' : managedCommandStatus
        const isCommandCheckpointCall = isManagedCommandCheckpointCall(toolName, argsRecord, resultRecord, partialResult)
        let state: 'running' | 'completed' | 'error' = 'running'
        if (type === 'tool_execution_end') {
            state = isError ? 'error' : 'completed'
            if (!isError && !isCommandCheckpointCall && lifecycleStatus === 'running') state = 'running'
            if (!isError && !isCommandCheckpointCall && lifecycleStatus === 'failed') state = 'error'
        }
        const completedAt = type === 'tool_execution_end' && state !== 'running' ? occurredAt : null
        const durationMs = completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null
        const output = readToolOutput(event['output'] ?? event['result'], partialResult)
        const classified = classifyZyraToolActivity({
            toolName,
            args: argsRecord,
            result: resultRecord,
            partialResult,
            state,
            output
        })
        const keepsSpecializedDesktopKind = classified.kind === 'command.checkpoint' || classified.kind.startsWith('subagent.')
        if (agentSurface && !keepsSpecializedDesktopKind) {
            classified.kind = agentSurface.kind
            classified.summary = agentSurface.summary
            classified.detail ||= agentSurface.primaryText
        }
        if (classified.kind === 'file-change') {
            Object.assign(classified.data, readPiFileChangeData({
                cwd: context.cwd,
                toolName,
                args: argsRecord,
                result: resultRecord,
                partialResult,
                type,
                state
            }), {
                toolCallId
            })
        }
        if (classified.kind === 'file-read') {
            Object.assign(classified.data, analyzeAssistantReadResult({
                args: argsRecord,
                result: resultRecord,
                partialResult,
                output,
                status: state === 'error' ? 'failed' : state
            }))
        }
        classified.data['toolLifecyclePhase'] = agentSurface?.phase
            || (type === 'tool_execution_start' ? 'start' : type === 'tool_execution_update' ? 'update' : 'end')
        if (type === 'tool_execution_end' && lifecycleStatus && !isCommandCheckpointCall) {
            classified.data['status'] = lifecycleStatus
            classified.summary = managedCommandSummary(lifecycleStatus)
        }
        if (agentSurface) {
            const effectiveLifecycle = lifecycleStatus
                || (state === 'error' ? 'failed' : state)
            classified.data['surface'] = {
                ...agentSurface,
                kind: keepsSpecializedDesktopKind ? agentSurface.kind : classified.kind,
                lifecycle: effectiveLifecycle,
                summary: classified.summary
            }
        }
        const activityId = `zyra-tool-${toolCallId}`
        const commandJobId = asString(classified.data['jobId'])
        const isCommandCheckpoint = classified.kind === 'command.checkpoint'
        const activityFailed = isCommandCheckpoint ? isError : lifecycleStatus === 'failed'
        const activityTone = activityFailed
            ? 'error'
            : !isCommandCheckpoint && lifecycleStatus === 'stopped'
                ? 'warning'
                : 'tool'
        const relatedCommandActivityId = isCommandCheckpoint && commandJobId
            ? context.commandActivityIdByJobId.get(commandJobId)
            : undefined
        if (!isCommandCheckpoint && commandJobId) {
            context.commandActivityIdByJobId.set(commandJobId, activityId)
        }
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'activity',
            createdAt: occurredAt,
            threadId: context.localThreadId,
            providerThreadId: context.providerThreadId,
            turnId: context.activeTurnId || undefined,
            itemId: toolCallId,
            payload: {
                activityId,
                kind: classified.kind,
                summary: classified.summary,
                detail: classified.detail,
                tone: activityTone,
                data: {
                    ...classified.data,
                    relatedCommandActivityId,
                    startedAt,
                    completedAt: completedAt || undefined,
                    durationMs: durationMs ?? undefined
                }
            }
        })
        if (type === 'tool_execution_end' && isCommandCheckpoint && relatedCommandActivityId && commandJobId && lifecycleStatus) {
            const lifecycleCompletedAt = lifecycleStatus === 'running' ? null : occurredAt
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'activity',
                createdAt: occurredAt,
                threadId: context.localThreadId,
                providerThreadId: context.providerThreadId,
                turnId: context.activeTurnId || undefined,
                payload: {
                    activityId: relatedCommandActivityId,
                    kind: 'command',
                    summary: managedCommandSummary(lifecycleStatus),
                    tone: lifecycleStatus === 'failed' ? 'error' : lifecycleStatus === 'stopped' ? 'warning' : 'tool',
                    data: {
                        status: lifecycleStatus,
                        jobId: commandJobId,
                        result: resultRecord || partialResult || undefined,
                        output,
                        completedAt: lifecycleCompletedAt,
                        durationMs: lifecycleStatus === 'running' ? null : undefined
                    }
                }
            })
        }
        if (type === 'tool_execution_end') {
            context.toolArgsByCallId.delete(toolCallId)
            context.toolStartedAtByCallId.delete(toolCallId)
        }
    }

    private requireSession(threadId: string): ZyraSessionContext {
        const session = this.getSessionContext(threadId)
        if (!session) throw new Error(`Unknown Zyra runtime session for thread ${threadId}.`)
        return session
    }

    private getSessionContext(threadId: string): ZyraSessionContext | undefined {
        const direct = this.sessions.get(threadId)
        if (direct) return direct
        const mapped = this.aliases.get(threadId)
        return mapped ? this.sessions.get(mapped) : undefined
    }

    private emitRuntime(event: AssistantRuntimeEvent): void {
        this.emit('runtime', event)
    }
}
