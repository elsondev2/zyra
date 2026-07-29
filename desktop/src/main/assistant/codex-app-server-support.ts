import { spawn } from 'node:child_process'
import readline from 'node:readline'
import type {
    AssistantAccountIdentity,
    AssistantAccountPlanType,
    AssistantCreditsSnapshot,
    AssistantModelInfo,
    AssistantRateLimitSnapshot,
    AssistantRateLimitWindow
} from '../../shared/assistant/contracts'
import { getAssistantModelReasoningEfforts } from '../../shared/assistant/reasoning-efforts'
import {
    asRecord,
    asString,
    killChildTree,
    readNumericValue,
    type JsonRpcMessage,
    type SessionContext
} from './codex-runtime-protocol'

const CODEX_AVAILABILITY_SUCCESS_TTL_MS = 20_000
const CODEX_AVAILABILITY_FAILURE_TTL_MS = 5_000

let availabilityCache:
    | {
        binary: string
        available: boolean
        reason: string | null
        checkedAt: number
    }
    | null = null
let availabilityPromise: Promise<{ available: boolean; reason: string | null }> | null = null

export async function checkCodexAvailability(codexBinary: string): Promise<{ available: boolean; reason: string | null }> {
    if (availabilityCache && availabilityCache.binary === codexBinary) {
        const ttlMs = availabilityCache.available ? CODEX_AVAILABILITY_SUCCESS_TTL_MS : CODEX_AVAILABILITY_FAILURE_TTL_MS
        if ((Date.now() - availabilityCache.checkedAt) < ttlMs) {
            return {
                available: availabilityCache.available,
                reason: availabilityCache.reason
            }
        }
    }

    if (availabilityPromise) {
        return availabilityPromise
    }

    availabilityPromise = new Promise<{ available: boolean; reason: string | null }>((resolve) => {
        const child = spawn(codexBinary, ['--version'], {
            shell: process.platform === 'win32',
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''
        let settled = false

        const finish = (result: { available: boolean; reason: string | null }) => {
            if (settled) return
            settled = true
            clearTimeout(timeoutId)
            availabilityCache = {
                binary: codexBinary,
                ...result,
                checkedAt: Date.now()
            }
            resolve(result)
        }

        const timeoutId = setTimeout(() => {
            killChildTree(child)
            finish({
                available: false,
                reason: 'Codex CLI availability check timed out.'
            })
        }, 4000)

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk || '')
        })
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk || '')
        })
        child.on('error', (error) => {
            finish({
                available: false,
                reason: error instanceof Error ? error.message : 'Codex CLI is unavailable.'
            })
        })
        child.on('exit', (code) => {
            if (code === 0) {
                finish({ available: true, reason: null })
                return
            }
            finish({
                available: false,
                reason: (stderr || stdout || 'Codex CLI is unavailable.').trim()
            })
        })
    })

    try {
        return await availabilityPromise
    } finally {
        availabilityPromise = null
    }
}

export function parseModelList(response: unknown): AssistantModelInfo[] {
    const record = asRecord(response)
    const models = Array.isArray(record?.['data'])
        ? record.data
        : Array.isArray(record?.['models'])
            ? record.models
            : Array.isArray(response)
                ? response
                : []

    return models
        .map((entry: unknown) => {
            const modelRecord = asRecord(entry)
            const id = asString(modelRecord?.['model']) || asString(modelRecord?.['id']) || asString(entry)
            if (!id) return null
            const parsed: AssistantModelInfo = {
                id,
                label: asString(modelRecord?.['displayName']) || asString(modelRecord?.['title']) || id,
                description: asString(modelRecord?.['description']),
                supportedEfforts: getAssistantModelReasoningEfforts(id)
            }
            return parsed
        })
        .filter((entry): entry is AssistantModelInfo => entry !== null)
}

export async function requestFromEphemeralServer<T>(args: {
    codexBinary: string
    modelId?: string
    method: string
    params: Record<string, unknown>
    timeoutMs?: number
    sendRequest: <TResponse>(context: SessionContext, method: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<TResponse>
    writeMessage: (context: SessionContext, message: Record<string, unknown>) => void
}): Promise<T> {
    const child = spawn(args.codexBinary, ['app-server'], {
        cwd: process.cwd(),
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
    })
    const output = readline.createInterface({ input: child.stdout })
    const context: SessionContext = {
        child,
        output,
        pending: new Map(),
        pendingApprovals: new Map(),
        pendingUserInputs: new Map(),
        fileChangeRevisionByItemId: new Map(),
        nextRequestId: 1,
        stopping: false,
        thread: {
            id: '__ephemeral-model-list__',
            providerThreadId: null,
            source: 'root',
            parentThreadId: null,
            providerParentThreadId: null,
            subagentDepth: null,
            agentNickname: null,
            agentRole: null,
            model: args.modelId || '',
            cwd: process.cwd(),
            messageCount: 0,
            activityCount: 0,
            proposedPlanCount: 0,
            lastSeenCompletedTurnId: null,
            runtimeMode: 'approval-required',
            interactionMode: 'default',
            state: 'starting',
            lastError: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            latestTurn: null,
            hasPendingApprovals: false,
            hasPendingUserInputs: false,
            hasActivePlan: false,
            activePlan: null,
            messages: [],
            proposedPlans: [],
            activities: [],
            pendingApprovals: [],
            pendingUserInputs: []
        }
    }

    output.on('line', (line) => {
        try {
            const parsed = JSON.parse(line) as JsonRpcMessage
            if (parsed['id'] !== undefined && parsed['method'] === undefined) {
                const pending = context.pending.get(String(parsed['id']))
                if (!pending) return
                clearTimeout(pending.timer)
                context.pending.delete(String(parsed['id']))
                const error = asRecord(parsed['error'])
                if (error?.['message']) {
                    pending.reject(new Error(String(error['message'])))
                    return
                }
                pending.resolve(parsed['result'])
            }
        } catch {
            // Ignore malformed lines from ephemeral requests.
        }
    })

    try {
        await args.sendRequest(context, 'initialize', {
            clientInfo: {
                name: 'cara_agent',
                title: "Zyra",
                version: '0.1.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }, 8000)
        args.writeMessage(context, { method: 'initialized' })
        return await args.sendRequest<T>(context, args.method, args.params, args.timeoutMs ?? 8000)
    } finally {
        for (const pending of context.pending.values()) {
            clearTimeout(pending.timer)
        }
        context.pending.clear()
        output.close()
        if (!child.killed) {
            killChildTree(child)
        }
    }
}

export function parseAccount(record: Record<string, unknown> | undefined): AssistantAccountIdentity | null {
    if (!record) return null
    const type = asString(record['type'])
    if (type === 'apiKey') {
        return {
            type,
            email: null,
            planType: null
        }
    }
    if (type === 'chatgpt') {
        return {
            type,
            email: asString(record['email']) || null,
            planType: parsePlanType(record['planType'])
        }
    }
    return null
}

export function parseAuthMode(value: unknown): 'apikey' | 'chatgpt' | 'chatgptAuthTokens' | null {
    const authMode = asString(value)
    if (authMode === 'apikey' || authMode === 'chatgpt' || authMode === 'chatgptAuthTokens') {
        return authMode
    }
    return null
}

export function parseRateLimitSnapshot(record: Record<string, unknown> | undefined): AssistantRateLimitSnapshot | null {
    if (!record) return null
    return {
        limitId: asString(record['limitId']) || null,
        limitName: asString(record['limitName']) || null,
        primary: parseRateLimitWindow(asRecord(record['primary'])),
        secondary: parseRateLimitWindow(asRecord(record['secondary'])),
        credits: parseCreditsSnapshot(asRecord(record['credits'])),
        planType: parsePlanType(record['planType'])
    }
}

export function parseRateLimitWindow(record: Record<string, unknown> | undefined): AssistantRateLimitWindow | null {
    if (!record) return null
    const usedPercent = Math.max(0, Math.min(100, readNumericValue(record['usedPercent']) ?? 0))
    return {
        usedPercent,
        remainingPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
        windowDurationMins: readNumericValue(record['windowDurationMins']) ?? null,
        resetsAt: readNumericValue(record['resetsAt']) ?? null
    }
}

export function parseCreditsSnapshot(record: Record<string, unknown> | undefined): AssistantCreditsSnapshot | null {
    if (!record) return null
    return {
        hasCredits: readBoolean(record['hasCredits']) ?? false,
        unlimited: readBoolean(record['unlimited']) ?? false,
        balance: asString(record['balance']) || null
    }
}

export function parsePlanType(value: unknown): AssistantAccountPlanType | null {
    const planType = asString(value)
    switch (planType) {
        case 'free':
        case 'go':
        case 'plus':
        case 'pro':
        case 'team':
        case 'business':
        case 'enterprise':
        case 'edu':
        case 'unknown':
            return planType
        default:
            return null
    }
}

export function readBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        if (value === 'true') return true
        if (value === 'false') return false
    }
    return undefined
}
