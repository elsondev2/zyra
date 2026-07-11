import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'
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
    AssistantThread
} from '../../shared/assistant/contracts'
import {
    checkCodexAvailability,
    parseAccount,
    parseAuthMode,
    parseModelList,
    parseRateLimitSnapshot,
    readBoolean,
    requestFromEphemeralServer
} from './codex-app-server-support'
import { handleResponse, handleStdoutLine } from './codex-runtime-events'
import {
    asRecord,
    asString,
    buildTurnParams,
    killChildTree,
    mapRuntimeMode,
    readNumericValue,
    type JsonRpcMessage,
    type SessionContext
} from './codex-runtime-protocol'
import {
    isMissingRolloutResumeError,
    toCodexUserInputAnswers
} from './codex-app-server-runtime-helpers'

function isToolRouterStderr(message: string): boolean {
    return /codex_core::tools::router:\s*error=/i.test(message)
}

export class CodexAppServerRuntime extends EventEmitter {
    private static readonly AVAILABILITY_SUCCESS_TTL_MS = 60_000

    private readonly sessions = new Map<string, SessionContext>()
    private readonly threadContextAliases = new Map<string, string>()
    private readonly codexBinary = process.platform === 'win32' ? 'codex.cmd' : 'codex'
    private modelCache: AssistantModelInfo[] = []
    private modelCacheLoaded = false
    private modelListPromise: Promise<AssistantModelInfo[]> | null = null
    private availability: { available: boolean; reason: string | null; checkedAt: number } | null = null
    private availabilityPromise: Promise<{ available: boolean; reason: string | null }> | null = null

    async checkAvailability(): Promise<{ available: boolean; reason: string | null }> {
        if (this.availability) {
            if (
                this.availability.available
                && (Date.now() - this.availability.checkedAt) < CodexAppServerRuntime.AVAILABILITY_SUCCESS_TTL_MS
            ) {
                return {
                    available: this.availability.available,
                    reason: this.availability.reason
                }
            }
        }
        if (this.availabilityPromise) return this.availabilityPromise

        this.availabilityPromise = checkCodexAvailability(this.codexBinary).then((result) => {
            this.availability = {
                ...result,
                checkedAt: Date.now()
            }
            return result
        })

        try {
            return await this.availabilityPromise
        } finally {
            this.availabilityPromise = null
        }
    }

    async listModels(forceRefresh = false): Promise<AssistantModelInfo[]> {
        if (!forceRefresh && this.modelCacheLoaded && this.modelCache.length > 0) return this.modelCache
        if (this.modelListPromise) return this.modelListPromise

        this.modelListPromise = (async () => {
            const session = this.sessions.values().next().value as SessionContext | undefined
            try {
                const response = session
                    ? await this.sendRequest<any>(session, 'model/list', {}, 8000)
                    : await this.listModelsFromEphemeralServer()
                const parsed = parseModelList(response)
                if (parsed.length > 0) {
                    this.modelCache = parsed
                    this.modelCacheLoaded = true
                }
            } catch (error) {
                log.warn('[Assistant] model/list failed', error)
            } finally {
                this.modelListPromise = null
            }
            return this.modelCache
        })()

        return this.modelListPromise
    }

    private async listModelsFromEphemeralServer(): Promise<Record<string, unknown>> {
        return requestFromEphemeralServer<Record<string, unknown>>({
            codexBinary: this.codexBinary,
            modelId: this.modelCache[0]?.id,
            method: 'model/list',
            params: {},
            timeoutMs: 8000,
            sendRequest: (context, method, params, timeoutMs) => this.sendRequest(context, method, params, timeoutMs),
            writeMessage: (context, message) => this.writeMessage(context, message)
        })
    }

    async getAccount(): Promise<{ account: AssistantAccountIdentity | null; authMode: 'apikey' | 'chatgpt' | 'chatgptAuthTokens' | null; requiresOpenaiAuth: boolean }> {
        const response = await this.requestFromAvailableServer<Record<string, unknown>>('account/read', { refreshToken: true }, 8000)
        return {
            account: parseAccount(asRecord(response?.['account'])),
            authMode: parseAuthMode(response?.['authMode']) ?? parseAuthMode(asRecord(response?.['account'])?.['authMode']),
            requiresOpenaiAuth: readBoolean(response?.['requiresOpenaiAuth']) ?? false
        }
    }

    async getAccountRateLimits(): Promise<{
        rateLimits: AssistantRateLimitSnapshot | null
        rateLimitsByLimitId: Record<string, AssistantRateLimitSnapshot>
    }> {
        const response = await this.requestFromAvailableServer<Record<string, unknown>>('account/rateLimits/read', {}, 8000)
        const rateLimitsByLimitIdRecord = asRecord(response?.['rateLimitsByLimitId'])
        const rateLimitsByLimitId = Object.entries(rateLimitsByLimitIdRecord || {}).reduce<Record<string, AssistantRateLimitSnapshot>>((accumulator, [limitId, value]) => {
            const snapshot = parseRateLimitSnapshot(asRecord(value))
            if (snapshot) {
                accumulator[limitId] = snapshot
            }
            return accumulator
        }, {})

        return {
            rateLimits: parseRateLimitSnapshot(asRecord(response?.['rateLimits'])),
            rateLimitsByLimitId
        }
    }

    private async requestFromAvailableServer<T>(method: string, params: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
        const session = this.sessions.values().next().value as SessionContext | undefined
        if (!session) {
            return requestFromEphemeralServer<T>({
                codexBinary: this.codexBinary,
                modelId: this.modelCache[0]?.id,
                method,
                params,
                timeoutMs,
                sendRequest: (context, requestMethod, requestParams, requestTimeoutMs) => this.sendRequest(context, requestMethod, requestParams, requestTimeoutMs),
                writeMessage: (context, message) => this.writeMessage(context, message)
            })
        }

        try {
            return await this.sendRequest<T>(session, method, params, timeoutMs)
        } catch (error) {
            log.warn(`[Assistant] ${method} failed on active session, retrying with ephemeral server`, error)
            return requestFromEphemeralServer<T>({
                codexBinary: this.codexBinary,
                modelId: this.modelCache[0]?.id,
                method,
                params,
                timeoutMs,
                sendRequest: (context, requestMethod, requestParams, requestTimeoutMs) => this.sendRequest(context, requestMethod, requestParams, requestTimeoutMs),
                writeMessage: (context, message) => this.writeMessage(context, message)
            })
        }
    }

    async connect(thread: AssistantThread, cwd: string): Promise<void> {
        if (this.sessions.has(thread.id)) return

        const availability = await this.checkAvailability()
        if (!availability.available) {
            throw new Error(availability.reason || 'Codex CLI is unavailable.')
        }

        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.state.changed',
            createdAt: new Date().toISOString(),
            threadId: thread.id,
            payload: { state: 'starting', message: 'Starting codex app-server' }
        })

        const child = spawn(this.codexBinary, ['app-server'], {
            cwd,
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
            thread: { ...thread, cwd }
        }

        this.sessions.set(thread.id, context)
        this.registerThreadAlias(thread.id, thread.id)
        if (thread.providerThreadId) {
            this.registerThreadAlias(thread.id, thread.providerThreadId)
        }
        this.attachProcessListeners(context)

        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.started',
            createdAt: new Date().toISOString(),
            threadId: thread.id,
            payload: {
                cwd,
                model: thread.model,
                runtimeMode: thread.runtimeMode,
                interactionMode: thread.interactionMode
            }
        })

        await this.sendRequest(context, 'initialize', {
            clientInfo: {
                name: 'cara_agent',
                title: "Zyra",
                version: '0.1.0'
            },
            capabilities: {
                experimentalApi: true
            }
        })
        this.writeMessage(context, { method: 'initialized' })
        if (!this.modelCacheLoaded || this.modelCache.length === 0) {
            void this.listModels(false)
        }

        const sessionOverrides = {
            cwd,
            model: thread.model,
            ...mapRuntimeMode(thread.runtimeMode)
        }

        let response: Record<string, unknown> | undefined
        if (thread.providerThreadId) {
            try {
                response = await this.sendRequest<Record<string, unknown>>(context, 'thread/resume', {
                    ...sessionOverrides,
                    threadId: thread.providerThreadId
                })
            } catch (error) {
                if (isMissingRolloutResumeError(error)) {
                    log.info('[Assistant] thread/resume missed existing rollout, falling back to thread/start')
                } else {
                    log.warn('[Assistant] thread/resume failed, falling back to thread/start', error)
                }
            }
        }
        if (!response) {
            response = await this.sendRequest<Record<string, unknown>>(context, 'thread/start', sessionOverrides)
        }

        const providerThreadId = asString(asRecord(response?.['thread'])?.['id']) || asString(response?.['threadId'])
        if (!providerThreadId) {
            throw new Error('Codex thread open response did not include a thread id.')
        }

        context.thread.providerThreadId = providerThreadId
        this.availability = {
            available: true,
            reason: null,
            checkedAt: Date.now()
        }
        this.registerThreadAlias(thread.id, providerThreadId)
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'thread.started',
            createdAt: new Date().toISOString(),
            threadId: thread.id,
            providerThreadId,
            payload: { providerThreadId }
        })
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.state.changed',
            createdAt: new Date().toISOString(),
            threadId: thread.id,
            providerThreadId,
            payload: { state: 'ready', message: `Connected to thread ${providerThreadId}` }
        })
    }

    hasSession(threadId: string): boolean {
        const context = this.getSessionContext(threadId)
        return Boolean(context?.thread.providerThreadId)
    }

    registerThreadAlias(sessionThreadId: string, aliasThreadId: string): void {
        const normalizedSessionThreadId = String(sessionThreadId || '').trim()
        const normalizedAliasThreadId = String(aliasThreadId || '').trim()
        if (!normalizedSessionThreadId || !normalizedAliasThreadId) return
        this.threadContextAliases.set(normalizedAliasThreadId, normalizedSessionThreadId)
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
        }
    ): Promise<{ turnId: string; providerThreadId: string | null }> {
        const context = this.requireSession(threadId)
        const targetProviderThreadId = this.resolveTargetProviderThreadId(threadId, context)
        if (!targetProviderThreadId) {
            throw new Error('Assistant thread is not connected.')
        }

        const response = await this.sendRequest<Record<string, unknown>>(
            context,
            'turn/start',
            buildTurnParams(
                {
                    ...context.thread,
                    providerThreadId: targetProviderThreadId
                },
                prompt,
                options?.model,
                options?.runtimeMode,
                options?.interactionMode,
                options?.effort,
                options?.serviceTier
            )
        )
        const turnId = asString(asRecord(response?.['turn'])?.['id']) || asString(response?.['turnId'])
        if (!turnId) {
            throw new Error('turn/start response did not include a turn id.')
        }

        context.thread = {
            ...context.thread,
            model: options?.model || context.thread.model,
            runtimeMode: options?.runtimeMode || context.thread.runtimeMode,
            interactionMode: options?.interactionMode || context.thread.interactionMode
        }
        return { turnId, providerThreadId: targetProviderThreadId }
    }

    async interruptTurn(threadId: string, turnId?: string): Promise<void> {
        const context = this.requireSession(threadId)
        const targetProviderThreadId = this.resolveTargetProviderThreadId(threadId, context)
        if (!targetProviderThreadId || !turnId) return
        await this.sendRequest(context, 'turn/interrupt', {
            threadId: targetProviderThreadId,
            turnId
        }, 8000)
    }

    async rollbackThread(threadId: string, numTurns: number): Promise<void> {
        const context = this.requireSession(threadId)
        const targetProviderThreadId = this.resolveTargetProviderThreadId(threadId, context)
        if (!targetProviderThreadId || numTurns < 1) return
        await this.sendRequest(context, 'thread/rollback', {
            threadId: targetProviderThreadId,
            numTurns
        }, 15000)
    }

    async respondApproval(threadId: string, requestId: string, decision: AssistantApprovalDecision): Promise<void> {
        const context = this.requireSession(threadId)
        const pending = context.pendingApprovals.get(requestId)
        if (!pending) throw new Error(`Unknown approval request: ${requestId}`)

        context.pendingApprovals.delete(requestId)
        this.writeMessage(context, { id: pending.jsonRpcId, result: { decision } })
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'approval.resolved',
            createdAt: new Date().toISOString(),
            threadId,
            turnId: pending.turnId,
            itemId: pending.itemId,
            requestId,
            payload: { decision }
        })
    }

    async respondUserInput(threadId: string, requestId: string, answers: Record<string, string | string[]>): Promise<void> {
        const context = this.requireSession(threadId)
        const pending = context.pendingUserInputs.get(requestId)
        if (!pending) throw new Error(`Unknown user-input request: ${requestId}`)

        context.pendingUserInputs.delete(requestId)
        const codexAnswers = toCodexUserInputAnswers(answers)
        this.writeMessage(context, { id: pending.jsonRpcId, result: { answers: codexAnswers } })
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'user-input.resolved',
            createdAt: new Date().toISOString(),
            threadId,
            turnId: pending.turnId,
            itemId: pending.itemId,
            requestId,
            payload: { answers }
        })
    }

    disconnect(threadId: string): void {
        const context = this.getSessionContext(threadId)
        if (!context) return

        context.stopping = true
        for (const pending of context.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error('Codex session stopped before request completed.'))
        }
        context.pending.clear()
        context.pendingApprovals.clear()
        context.pendingUserInputs.clear()
        context.output.close()
        if (!context.child.killed) {
            killChildTree(context.child)
        }
        const sessionThreadId = context.thread.id
        this.sessions.delete(sessionThreadId)
        for (const [aliasThreadId, mappedThreadId] of this.threadContextAliases.entries()) {
            if (mappedThreadId === sessionThreadId) {
                this.threadContextAliases.delete(aliasThreadId)
            }
        }
        this.emitRuntime({
            eventId: randomUUID(),
            type: 'session.state.changed',
            createdAt: new Date().toISOString(),
            threadId: sessionThreadId,
            payload: { state: 'stopped', message: 'Session disconnected.' }
        })
    }

    dispose(): void {
        for (const threadId of [...this.sessions.keys()]) {
            this.disconnect(threadId)
        }
    }

    private attachProcessListeners(context: SessionContext): void {
        context.output.on('line', (line) => handleStdoutLine(context, line, {
            emitRuntime: (event) => this.emitRuntime(event),
            writeMessage: (targetContext, message) => this.writeMessage(targetContext, message),
            registerThreadAlias: (sessionThreadId, aliasThreadId) => this.registerThreadAlias(sessionThreadId, aliasThreadId)
        }))
        context.child.stderr.on('data', (chunk) => {
            const message = String(chunk || '').trim()
            if (!message) return
            if (isToolRouterStderr(message)) {
                log.debug('[Assistant] suppressed codex tool-router stderr', message)
                return
            }
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'activity',
                createdAt: new Date().toISOString(),
                threadId: context.thread.id,
                payload: { kind: 'process.stderr', summary: 'Codex stderr', detail: message, tone: 'warning' }
            })
        })
        context.child.on('error', (error) => {
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'session.state.changed',
                createdAt: new Date().toISOString(),
                threadId: context.thread.id,
                payload: { state: 'error', error: error.message, message: error.message }
            })
        })
        context.child.on('exit', (code, signal) => {
            if (context.stopping) return
            const sessionThreadId = context.thread.id
            this.sessions.delete(sessionThreadId)
            for (const [aliasThreadId, mappedThreadId] of this.threadContextAliases.entries()) {
                if (mappedThreadId === sessionThreadId) {
                    this.threadContextAliases.delete(aliasThreadId)
                }
            }
            this.emitRuntime({
                eventId: randomUUID(),
                type: 'session.state.changed',
                createdAt: new Date().toISOString(),
                threadId: sessionThreadId,
                payload: {
                    state: code === 0 ? 'stopped' : 'error',
                    message: `codex app-server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`
                }
            })
        })
    }

    private async sendRequest<T>(context: SessionContext, method: string, params: Record<string, unknown>, timeoutMs = 20000): Promise<T> {
        const id = context.nextRequestId++
        const result = await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                context.pending.delete(String(id))
                reject(new Error(`Timed out waiting for ${method}.`))
            }, timeoutMs)
            context.pending.set(String(id), { method, timer, resolve, reject })
            this.writeMessage(context, { id, method, params })
        })
        return result as T
    }

    private writeMessage(context: SessionContext, message: Record<string, unknown>): void {
        if (!context.child.stdin.writable) {
            throw new Error('Cannot write to codex app-server stdin.')
        }
        context.child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    private requireSession(threadId: string): SessionContext {
        const session = this.getSessionContext(threadId)
        if (!session) throw new Error(`Unknown assistant runtime session for thread ${threadId}.`)
        return session
    }

    private getSessionContext(threadId: string): SessionContext | undefined {
        const direct = this.sessions.get(threadId)
        if (direct) return direct
        const contextThreadId = this.threadContextAliases.get(threadId)
        return contextThreadId ? this.sessions.get(contextThreadId) : undefined
    }

    private resolveTargetProviderThreadId(threadId: string, context: SessionContext): string | null {
        const normalizedThreadId = String(threadId || '').trim()
        if (!normalizedThreadId) return context.thread.providerThreadId || null
        if (normalizedThreadId === context.thread.id) return context.thread.providerThreadId || null
        if (normalizedThreadId === context.thread.providerThreadId) return context.thread.providerThreadId || null
        const mappedThreadId = this.threadContextAliases.get(normalizedThreadId)
        if (mappedThreadId === context.thread.id) {
            return normalizedThreadId
        }
        return context.thread.providerThreadId || null
    }

    private emitRuntime(event: AssistantRuntimeEvent): void {
        this.emit('runtime', event)
    }
}
