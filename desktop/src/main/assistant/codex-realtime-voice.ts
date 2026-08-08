import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline, { type Interface as ReadlineInterface } from 'node:readline'
import log from 'electron-log'
import type {
    AssistantRealtimeVoiceEvent,
    AssistantSendRealtimeVoiceMessageInput,
    InstructorOutputModality,
    InstructorRealtimeVoice
} from '../../shared/assistant/contracts'
import {
    buildInstructorAppServerArgs,
    buildInstructorRealtimeMessageTurnParams,
    buildInstructorRealtimeStartParams,
    buildInstructorThreadStartParams,
    normalizeInstructorRealtimeMessage,
    normalizeInstructorVoiceInstructions,
    normalizeWebRtcOfferSdp,
    parseInstructorRealtimeNotification
} from './codex-realtime-voice-contract'

interface PendingRequest {
    timer: NodeJS.Timeout
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

interface PendingSdp {
    timer: NodeJS.Timeout
    resolve: (sdp: string) => void
    reject: (error: Error) => void
}

interface PendingStarted {
    timer: NodeJS.Timeout
    resolve: (value: { version: string; realtimeSessionId?: string }) => void
    reject: (error: Error) => void
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' ? value as JsonRecord : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function stopChildProcess(child: ChildProcessWithoutNullStreams): void {
    if (process.platform === 'win32' && child.pid) {
        try {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true
            })
            return
        } catch {
            // Fall through to a direct process kill.
        }
    }
    child.kill()
}

export class CodexRealtimeVoiceRuntime extends EventEmitter {
    private readonly codexBinary = process.platform === 'win32' ? 'codex.cmd' : 'codex'
    private child: ChildProcessWithoutNullStreams | null = null
    private output: ReadlineInterface | null = null
    private readonly pending = new Map<string, PendingRequest>()
    private pendingSdp: PendingSdp | null = null
    private pendingStarted: PendingStarted | null = null
    private nextRequestId = 1
    private threadId: string | null = null
    private stopping = false
    private lifecycleGeneration = 0
    private terminalEventEmitted = false
    private readonly composerTurnText = new Map<string, string>()

    async start(input: {
        cwd: string
        sdp: string
        instructions?: string
        voice?: InstructorRealtimeVoice
        outputModality?: InstructorOutputModality
    }): Promise<{
        threadId: string
        sdp: string
        realtimeVersion: string
    }> {
        const generation = ++this.lifecycleGeneration
        await this.stopCurrent()
        this.assertCurrentGeneration(generation)

        const instructions = normalizeInstructorVoiceInstructions(input.instructions)
        const offerSdp = normalizeWebRtcOfferSdp(input.sdp)
        this.spawnServer(input.cwd)
        this.emitVoiceEvent({ type: 'session.starting' })

        try {
            await this.sendRequest('initialize', {
                clientInfo: {
                    name: 'Zyra',
                    title: 'Zyra Voice Lab',
                    version: '0.1.0'
                },
                capabilities: {
                    experimentalApi: true
                }
            }, 30_000)
            this.assertCurrentGeneration(generation)
            this.writeMessage({ method: 'initialized', params: {} })

            const threadResponse = await this.sendRequest(
                'thread/start',
                buildInstructorThreadStartParams(input.cwd, instructions),
                60_000
            )
            this.assertCurrentGeneration(generation)

            const threadRecord = asRecord(asRecord(threadResponse)?.['thread'])
            const threadId = asString(threadRecord?.['id']) || asString(asRecord(threadResponse)?.['threadId'])
            if (!threadId) throw new Error('Codex did not return a realtime thread id.')
            this.threadId = threadId

            const startedPromise = this.waitForStarted(60_000)
            const answerSdpPromise = this.waitForAnswerSdp(60_000)
            const requestPromise = this.sendRequest(
                'thread/realtime/start',
                buildInstructorRealtimeStartParams(threadId, offerSdp, instructions, {
                    voice: input.voice,
                    outputModality: input.outputModality
                }),
                45_000
            )
            const [, started, answerSdp] = await Promise.all([
                requestPromise,
                startedPromise,
                answerSdpPromise
            ])
            this.assertCurrentGeneration(generation)

            if (started.version !== 'v3') {
                throw new Error(`Codex negotiated unsupported realtime version ${started.version || 'unknown'}.`)
            }

            log.info('[InstructorVoice] Codex realtime v3 signaling ready', { threadId })
            return { threadId, sdp: answerSdp, realtimeVersion: started.version }
        } catch (error) {
            if (generation === this.lifecycleGeneration) {
                const message = error instanceof Error ? error.message : 'Codex realtime voice failed to start.'
                if (!this.terminalEventEmitted) {
                    this.emitVoiceEvent({ type: 'session.error', threadId: this.threadId || undefined, message })
                }
                await this.stopCurrent()
            }
            throw error
        }
    }

    async sendMessage(input: AssistantSendRealtimeVoiceMessageInput): Promise<{ mode: 'text-turn' | 'vision-turn' }> {
        const child = this.child
        const threadId = this.threadId
        if (!child?.stdin.writable || !threadId || this.stopping) {
            throw new Error('Start the voice session before sending a message.')
        }

        const message = normalizeInstructorRealtimeMessage(input)
        const response = await this.sendRequest(
            'turn/start',
            buildInstructorRealtimeMessageTurnParams(threadId, message),
            30_000
        )
        const turnId = asString(asRecord(asRecord(response)?.['turn'])?.['id'])
        if (!turnId) throw new Error('Codex did not return a typed voice turn id.')
        this.composerTurnText.set(turnId, '')
        return { mode: message.images.length > 0 ? 'vision-turn' : 'text-turn' }
    }

    async stop(): Promise<void> {
        this.lifecycleGeneration += 1
        await this.stopCurrent()
    }

    dispose(): void {
        this.lifecycleGeneration += 1
        if (!this.child) return
        this.stopping = true
        this.disposeProcess(new Error('Codex realtime voice disposed.'))
        this.stopping = false
    }

    private async stopCurrent(): Promise<void> {
        const child = this.child
        const threadId = this.threadId
        if (!child) return

        this.stopping = true
        try {
            if (threadId && child.stdin.writable) {
                await this.sendRequest('thread/realtime/stop', { threadId }, 5_000).catch(() => undefined)
            }
            if (this.child === child) {
                this.disposeProcess(new Error('Codex realtime voice stopped.'))
            }
        } finally {
            this.stopping = false
        }
    }

    private assertCurrentGeneration(generation: number): void {
        if (generation !== this.lifecycleGeneration) {
            throw new Error('Codex realtime voice start was superseded.')
        }
    }

    private spawnServer(cwd: string): void {
        const child = spawn(this.codexBinary, buildInstructorAppServerArgs(), {
            cwd,
            shell: process.platform === 'win32',
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        }) as ChildProcessWithoutNullStreams
        const output = readline.createInterface({ input: child.stdout })

        this.child = child
        this.output = output
        this.threadId = null
        this.nextRequestId = 1
        this.stopping = false
        this.terminalEventEmitted = false
        this.composerTurnText.clear()

        output.on('line', (line) => this.handleLine(line))
        child.stderr.on('data', (chunk) => {
            const message = String(chunk || '').trim()
            if (message) log.debug('[InstructorVoice] codex app-server stderr', message)
        })
        child.on('error', (error) => {
            if (this.stopping || this.child !== child) return
            this.terminalEventEmitted = true
            this.emitVoiceEvent({ type: 'session.error', threadId: this.threadId || undefined, message: error.message })
            this.disposeProcess(error)
        })
        child.on('exit', (code, signal) => {
            if (this.child !== child) return
            const expected = this.stopping
            const threadId = this.threadId || undefined
            const message = `Codex realtime process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`
            this.disposeProcess(new Error(message), false)
            if (!expected) {
                this.terminalEventEmitted = true
                this.emitVoiceEvent({ type: 'session.closed', threadId, reason: message })
            }
        })
    }

    private handleLine(line: string): void {
        let message: JsonRecord
        try {
            message = JSON.parse(line) as JsonRecord
        } catch {
            log.debug('[InstructorVoice] ignored malformed app-server output')
            return
        }

        const method = asString(message['method'])
        const id = message['id']
        if (id !== undefined && !method) {
            const pending = this.pending.get(String(id))
            if (!pending) return
            clearTimeout(pending.timer)
            this.pending.delete(String(id))
            const error = asRecord(message['error'])
            const errorMessage = asString(error?.['message'])
            if (errorMessage) pending.reject(new Error(errorMessage))
            else pending.resolve(message['result'])
            return
        }

        if (!method) return
        const payload = asRecord(message['params']) || {}
        const notificationThreadId = asString(payload['threadId'])
        if (
            method.startsWith('thread/realtime/')
            && this.threadId
            && notificationThreadId
            && notificationThreadId !== this.threadId
        ) {
            return
        }

        if (method === 'thread/realtime/sdp') {
            const sdp = asString(payload['sdp'])
            if (sdp && this.pendingSdp) {
                const pendingSdp = this.pendingSdp
                this.pendingSdp = null
                clearTimeout(pendingSdp.timer)
                pendingSdp.resolve(sdp)
            }
            return
        }

        this.handleComposerTurnNotification(method, payload)

        const event = parseInstructorRealtimeNotification(method, payload)
        if (event) {
            if (event.type === 'session.started' && this.pendingStarted) {
                const pendingStarted = this.pendingStarted
                this.pendingStarted = null
                clearTimeout(pendingStarted.timer)
                pendingStarted.resolve({
                    version: event.realtimeVersion || '',
                    realtimeSessionId: event.realtimeSessionId
                })
            }

            this.emitVoiceEvent(event)

            if (event.type === 'session.error' || event.type === 'session.closed') {
                const terminalError = new Error(
                    event.type === 'session.error'
                        ? event.message
                        : event.reason || 'Codex realtime voice closed.'
                )
                this.terminalEventEmitted = true
                this.rejectPendingStarted(terminalError)
                this.rejectPendingSdp(terminalError)
                if (!this.stopping) this.disposeProcess(terminalError)
            }
        }

        if (id !== undefined && this.child) {
            this.writeMessage({
                id,
                error: {
                    code: -32601,
                    message: `Unsupported instructor voice request: ${method}`
                }
            })
        }
    }

    private handleComposerTurnNotification(method: string, payload: JsonRecord): void {
        if (method === 'item/agentMessage/delta') {
            const turnId = asString(payload['turnId'])
            const delta = typeof payload['delta'] === 'string' ? payload['delta'] as string : ''
            if (!turnId || !delta || !this.composerTurnText.has(turnId)) return
            const text = `${this.composerTurnText.get(turnId) || ''}${delta}`
            this.composerTurnText.set(turnId, text)
            this.emitVoiceEvent({
                type: 'composer.response.delta',
                threadId: this.threadId || undefined,
                turnId,
                delta
            })
            return
        }

        if (method !== 'turn/completed') return
        const turn = asRecord(payload['turn'])
        const turnId = asString(turn?.['id'])
        if (!turnId || !this.composerTurnText.has(turnId)) return
        const text = this.composerTurnText.get(turnId) || ''
        this.composerTurnText.delete(turnId)
        const status = asString(turn?.['status']) || ''
        const error = asString(asRecord(turn?.['error'])?.['message'])
        this.emitVoiceEvent({
            type: 'composer.response.done',
            threadId: this.threadId || undefined,
            turnId,
            text,
            error: error || (status === 'failed' ? 'The typed voice turn failed.' : undefined)
        })
    }

    private sendRequest(method: string, params: JsonRecord, timeoutMs: number): Promise<unknown> {
        const id = this.nextRequestId++
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(String(id))
                reject(new Error(`Timed out waiting for ${method}.`))
            }, timeoutMs)
            this.pending.set(String(id), { timer, resolve, reject })
            try {
                this.writeMessage({ id, method, params })
            } catch (error) {
                clearTimeout(timer)
                this.pending.delete(String(id))
                reject(error instanceof Error ? error : new Error(`Failed to send ${method}.`))
            }
        })
    }

    private waitForStarted(timeoutMs: number): Promise<{ version: string; realtimeSessionId?: string }> {
        this.rejectPendingStarted(new Error('A newer realtime request replaced this one.'))
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingStarted?.timer === timer) this.pendingStarted = null
                reject(new Error('Timed out waiting for Codex realtime startup.'))
            }, timeoutMs)
            this.pendingStarted = { timer, resolve, reject }
        })
    }

    private waitForAnswerSdp(timeoutMs: number): Promise<string> {
        this.rejectPendingSdp(new Error('A newer realtime request replaced this one.'))
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingSdp?.timer === timer) this.pendingSdp = null
                reject(new Error('Timed out waiting for the Codex WebRTC answer.'))
            }, timeoutMs)
            this.pendingSdp = { timer, resolve, reject }
        })
    }

    private rejectPendingStarted(error: Error): void {
        if (!this.pendingStarted) return
        clearTimeout(this.pendingStarted.timer)
        this.pendingStarted.reject(error)
        this.pendingStarted = null
    }

    private rejectPendingSdp(error: Error): void {
        if (!this.pendingSdp) return
        clearTimeout(this.pendingSdp.timer)
        this.pendingSdp.reject(error)
        this.pendingSdp = null
    }

    private writeMessage(message: JsonRecord): void {
        if (!this.child?.stdin.writable) throw new Error('Codex realtime process is unavailable.')
        this.child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    private disposeProcess(error: Error, terminate = true): void {
        const child = this.child
        this.child = null
        this.threadId = null
        this.rejectPendingStarted(error)
        this.rejectPendingSdp(error)
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(error)
        }
        this.pending.clear()
        this.composerTurnText.clear()
        this.output?.close()
        this.output = null
        if (terminate && child && !child.killed) stopChildProcess(child)
    }

    private emitVoiceEvent(event: AssistantRealtimeVoiceEvent): void {
        this.emit('event', event)
    }
}
