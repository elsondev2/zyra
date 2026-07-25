import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline, { type Interface as ReadlineInterface } from 'node:readline'
import log from 'electron-log'
import type { AssistantRealtimeVoiceEvent } from '../../shared/assistant/contracts'
import {
    buildInstructorAppServerArgs,
    buildInstructorRealtimeStartParams,
    buildInstructorThreadStartParams,
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
    private nextRequestId = 1
    private threadId: string | null = null
    private stopping = false

    async start(input: { cwd: string; sdp: string; instructions?: string }): Promise<{ threadId: string; sdp: string }> {
        await this.stop()

        const instructions = normalizeInstructorVoiceInstructions(input.instructions)
        const offerSdp = normalizeWebRtcOfferSdp(input.sdp)
        this.spawnServer(input.cwd)
        this.emitVoiceEvent({ type: 'session.starting' })

        try {
            await this.sendRequest('initialize', {
                clientInfo: {
                    name: 'zyra_instructor_voice_lab',
                    title: 'Zyra Instructor Voice Lab',
                    version: '0.1.0'
                },
                capabilities: {
                    experimentalApi: true
                }
            }, 10_000)
            this.writeMessage({ method: 'initialized' })

            const threadResponse = await this.sendRequest('thread/start', buildInstructorThreadStartParams(input.cwd, instructions), 60_000)
            const threadRecord = asRecord(asRecord(threadResponse)?.['thread'])
            const threadId = asString(threadRecord?.['id']) || asString(asRecord(threadResponse)?.['threadId'])
            if (!threadId) throw new Error('Codex did not return a realtime thread id.')
            this.threadId = threadId

            const [, answerSdp] = await Promise.all([
                this.sendRequest(
                    'thread/realtime/start',
                    buildInstructorRealtimeStartParams(threadId, offerSdp, instructions),
                    45_000
                ),
                this.waitForAnswerSdp(60_000)
            ])
            return { threadId, sdp: answerSdp }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Codex realtime voice failed to start.'
            this.emitVoiceEvent({ type: 'session.error', threadId: this.threadId || undefined, message })
            await this.stop()
            throw error
        }
    }

    async stop(): Promise<void> {
        const child = this.child
        const threadId = this.threadId
        if (!child) return

        this.stopping = true
        if (threadId && child.stdin.writable) {
            await this.sendRequest('thread/realtime/stop', { threadId }, 5_000).catch(() => undefined)
        }
        this.disposeProcess(new Error('Codex realtime voice stopped.'))
        this.stopping = false
    }

    dispose(): void {
        if (!this.child) return
        this.stopping = true
        this.disposeProcess(new Error('Codex realtime voice disposed.'))
        this.stopping = false
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

        output.on('line', (line) => this.handleLine(line))
        child.stderr.on('data', (chunk) => {
            const message = String(chunk || '').trim()
            if (message) log.debug('[InstructorVoice] codex app-server stderr', message)
        })
        child.on('error', (error) => {
            if (this.stopping) return
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

        const event = parseInstructorRealtimeNotification(method, payload)
        if (event) {
            this.emitVoiceEvent(event)
            if (event.type === 'session.error') this.rejectPendingSdp(new Error(event.message))
            if (event.type === 'session.closed') this.rejectPendingSdp(new Error(event.reason || 'Codex realtime voice closed.'))
        }

        if (id !== undefined) {
            this.writeMessage({
                id,
                error: {
                    code: -32601,
                    message: `Unsupported instructor voice request: ${method}`
                }
            })
        }
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
        this.rejectPendingSdp(error)
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(error)
        }
        this.pending.clear()
        this.output?.close()
        this.output = null
        if (terminate && child && !child.killed) stopChildProcess(child)
    }

    private emitVoiceEvent(event: AssistantRealtimeVoiceEvent): void {
        this.emit('event', event)
    }
}
