import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import log from 'electron-log'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_HEALTH_PATH,
    BROWSER_ASSISTANT_BRIDGE_HOST,
    BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH,
    BROWSER_ASSISTANT_BRIDGE_PORT,
    BROWSER_ASSISTANT_BRIDGE_PORT_CANDIDATES,
    BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH,
    isBrowserAssistantBridgeMethod,
    isBrowserDevscopeBridgePath,
    type BrowserAssistantBridgeDescriptor,
    type BrowserAssistantBridgeInvokeRequest,
    type BrowserAssistantBridgeInvokeResponse,
    type BrowserAssistantBridgeMethod,
    type BrowserDevscopeBridgeInvokeRequest
} from '../../shared/browser-assistant-bridge'
import type {
    AssistantEventStreamPayload,
    AssistantPersistClipboardImageInput,
    AssistantTranscribeVoiceInput,
    AssistantVoiceTranscriptionState
} from '../../shared/assistant/contracts'
import type { AssistantService } from './service'

const MAX_REQUEST_BYTES = 32 * 1024 * 1024
const EVENT_HEARTBEAT_MS = 15_000
const MAX_EVENT_CLIENTS = 4
const DIRECT_READ_METHODS = new Set<BrowserAssistantBridgeMethod>(['bootstrap', 'getSnapshot', 'getStatus'])

type BrowserAssistantBridgeDependencies = {
    service: AssistantService
    allowedOrigins: ReadonlySet<string>
    capability: string
    descriptorPath?: string
    invokeDevscope: (path: string[], args: unknown[]) => Promise<unknown>
    onAssistantClientCountChanged?: (count: number) => void
    host?: string
    port?: number
    persistClipboardImage: (input: AssistantPersistClipboardImageInput) => Promise<string>
    resolveClipboardAttachment: (reference: string) => Promise<string | null>
    getVoiceTranscriptionState: () => Promise<AssistantVoiceTranscriptionState>
    transcribeVoice: (input: AssistantTranscribeVoiceInput) => Promise<string>
}

export class BrowserAssistantBridge {
    private server: Server | null = null
    private readonly eventResponses = new Set<ServerResponse>()
    private heartbeatTimer: NodeJS.Timeout | null = null
    private unsubscribeAssistantEvents: (() => void) | null = null

    constructor(private readonly dependencies: BrowserAssistantBridgeDependencies) {}

    async start(): Promise<{ host: string; port: number }> {
        if (this.server) return this.address()
        const server = createServer((request, response) => {
            void this.handleRequest(request, response).catch((error) => {
                log.error('[BrowserAssistantBridge] request failed', error)
                if (!response.headersSent) this.writeJson(response, 500, {
                    ok: false,
                    error: error instanceof Error ? error.message : 'Browser bridge request failed.'
                } satisfies BrowserAssistantBridgeInvokeResponse)
                else response.end()
            })
        })
        this.server = server
        this.unsubscribeAssistantEvents = this.dependencies.service.subscribeExternalEvents((payload) => {
            this.broadcastEvent(payload)
        })
        this.heartbeatTimer = setInterval(() => {
            for (const response of [...this.eventResponses]) {
                if (response.write(': heartbeat\n\n')) continue
                this.removeEventResponse(response)
                response.end()
            }
        }, EVENT_HEARTBEAT_MS)
        this.heartbeatTimer.unref?.()

        const candidatePorts = this.dependencies.port === undefined
            ? BROWSER_ASSISTANT_BRIDGE_PORT_CANDIDATES
            : [this.dependencies.port]
        let listening = false
        let lastError: unknown = null
        for (const port of candidatePorts) {
            try {
                await this.listen(server, port)
                listening = true
                break
            } catch (error) {
                lastError = error
                if ((error as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') break
            }
        }
        if (!listening) {
            this.cleanupSubscriptions()
            this.server = null
            throw lastError instanceof Error ? lastError : new Error('No browser bridge port is available.')
        }

        const address = this.address()
        try {
            await this.writeDescriptor(address)
        } catch (error) {
            await this.stop()
            throw error
        }
        log.info('[BrowserAssistantBridge] listening', address)
        return address
    }

    async stop(): Promise<void> {
        const server = this.server
        this.server = null
        this.cleanupSubscriptions()
        await this.removeDescriptor()
        for (const response of [...this.eventResponses]) response.end()
        this.eventResponses.clear()
        this.dependencies.onAssistantClientCountChanged?.(0)
        if (!server) return
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    private listen(server: Server, port: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const fail = (error: Error) => {
                server.off('listening', ready)
                reject(error)
            }
            const ready = () => {
                server.off('error', fail)
                resolve()
            }
            server.once('error', fail)
            server.once('listening', ready)
            server.listen(port, this.dependencies.host ?? BROWSER_ASSISTANT_BRIDGE_HOST)
        })
    }

    private address(): { host: string; port: number } {
        const address = this.server?.address()
        if (!address || typeof address === 'string') {
            return {
                host: this.dependencies.host ?? BROWSER_ASSISTANT_BRIDGE_HOST,
                port: this.dependencies.port ?? BROWSER_ASSISTANT_BRIDGE_PORT
            }
        }
        return { host: address.address, port: address.port }
    }

    private cleanupSubscriptions(): void {
        this.unsubscribeAssistantEvents?.()
        this.unsubscribeAssistantEvents = null
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
    }

    private hasValidCapability(value: string | string[] | undefined): boolean {
        if (typeof value !== 'string') return false
        const expected = Buffer.from(this.dependencies.capability)
        const supplied = Buffer.from(value)
        return expected.length === supplied.length && timingSafeEqual(expected, supplied)
    }

    private async writeDescriptor(address: { host: string; port: number }): Promise<void> {
        const descriptorPath = this.dependencies.descriptorPath
        if (!descriptorPath) return
        const descriptor: BrowserAssistantBridgeDescriptor = {
            host: BROWSER_ASSISTANT_BRIDGE_HOST,
            port: address.port,
            capability: this.dependencies.capability,
            pid: process.pid,
            createdAt: new Date().toISOString()
        }
        await mkdir(dirname(descriptorPath), { recursive: true })
        await writeFile(descriptorPath, JSON.stringify(descriptor), { encoding: 'utf8', mode: 0o600 })
    }

    private async removeDescriptor(): Promise<void> {
        const descriptorPath = this.dependencies.descriptorPath
        if (!descriptorPath) return
        try {
            const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as Partial<BrowserAssistantBridgeDescriptor>
            if (descriptor.capability !== this.dependencies.capability) return
        } catch {
            return
        }
        await rm(descriptorPath, { force: true }).catch(() => undefined)
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const origin = String(request.headers.origin || '')
        if (!this.dependencies.allowedOrigins.has(origin)) {
            this.writeJson(response, 403, { ok: false, error: 'Browser origin is not authorized.' })
            return
        }
        this.writeCorsHeaders(response, origin)

        if (request.method === 'OPTIONS') {
            response.statusCode = 204
            response.end()
            return
        }
        if (request.headers[BROWSER_ASSISTANT_BRIDGE_HEADER] !== BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE) {
            this.writeJson(response, 403, { ok: false, error: 'Browser bridge client header is missing.' })
            return
        }
        if (!this.hasValidCapability(request.headers[BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER])) {
            this.writeJson(response, 403, { ok: false, error: 'Browser bridge capability is invalid.' })
            return
        }

        const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
        if (request.method === 'GET' && requestUrl.pathname === BROWSER_ASSISTANT_BRIDGE_HEALTH_PATH) {
            this.writeJson(response, 200, { ok: true, service: 'zyra-browser-assistant', version: 1 })
            return
        }
        if (request.method === 'GET' && requestUrl.pathname === BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH) {
            this.openEventStream(request, response)
            return
        }
        if (request.method === 'POST' && requestUrl.pathname === BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH) {
            if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
                this.writeJson(response, 415, { ok: false, error: 'Browser bridge requests require JSON.' })
                return
            }
            const body = await this.readJsonBody(request)
            const candidate = body as Partial<BrowserDevscopeBridgeInvokeRequest> | null
            if (!candidate || !isBrowserDevscopeBridgePath(candidate.path) || !Array.isArray(candidate.args)) {
                this.writeJson(response, 400, { ok: false, error: 'Browser action request is invalid.' })
                return
            }
            try {
                const value = await this.dependencies.invokeDevscope(candidate.path, candidate.args)
                this.writeJson(response, 200, { ok: true, value } satisfies BrowserAssistantBridgeInvokeResponse)
            } catch (error) {
                this.writeJson(response, 200, {
                    ok: false,
                    error: error instanceof Error ? error.message : 'Browser action failed.'
                } satisfies BrowserAssistantBridgeInvokeResponse)
            }
            return
        }
        if (request.method !== 'POST' || requestUrl.pathname !== BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH) {
            this.writeJson(response, 404, { ok: false, error: 'Browser bridge route not found.' })
            return
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
            this.writeJson(response, 415, { ok: false, error: 'Browser bridge requests require JSON.' })
            return
        }

        const body = await this.readJsonBody(request)
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            this.writeJson(response, 400, { ok: false, error: 'Browser bridge request must be an object.' })
            return
        }
        const candidate = body as Partial<BrowserAssistantBridgeInvokeRequest>
        if (!isBrowserAssistantBridgeMethod(candidate.method) || !Array.isArray(candidate.args)) {
            this.writeJson(response, 400, { ok: false, error: 'Browser bridge method is invalid.' })
            return
        }

        try {
            const value = await this.invoke(candidate.method, candidate.args)
            this.writeJson(response, 200, { ok: true, value } satisfies BrowserAssistantBridgeInvokeResponse)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Assistant request failed.'
            if (DIRECT_READ_METHODS.has(candidate.method)) {
                this.writeJson(response, 500, { ok: false, error: message } satisfies BrowserAssistantBridgeInvokeResponse)
                return
            }
            this.writeJson(response, 200, {
                ok: true,
                value: { success: false, error: message }
            } satisfies BrowserAssistantBridgeInvokeResponse)
        }
    }

    private async invoke(method: BrowserAssistantBridgeMethod, args: unknown[]): Promise<unknown> {
        const service = this.dependencies.service
        switch (method) {
            case 'bootstrap': return service.getBootstrap()
            case 'getSnapshot': return service.getSnapshot()
            case 'getFleetSnapshot': return service.getFleetSnapshot(args[0] as string)
            case 'agentAction': return service.runFleetOperation('agents', args[0] as any)
            case 'workflowAction': return service.runFleetOperation('workflows', args[0] as any)
            case 'getStatus': return service.getStatus()
            case 'getAccountOverview': return service.getAccountOverview()
            case 'redeemAccountReset': return service.redeemAccountReset(args[0] as any)
            case 'getSessionTurnUsage': return service.getSessionTurnUsage(args[0] as any)
            case 'listModels': return service.listModels(args[0] === true)
            case 'connect': return service.connect(args[0] as any)
            case 'disconnect': return service.disconnect(args[0] as string | undefined)
            case 'createSession': return service.createSession(args[0] as any)
            case 'selectSession': return service.selectSession(args[0] as string)
            case 'selectThread': {
                const input = args[0] as { sessionId: string; threadId: string }
                return service.selectThread(input.sessionId, input.threadId)
            }
            case 'getThreadDetailBootstrap': return service.getThreadDetailBootstrap(args[0] as string)
            case 'getHistoryPage': return service.getHistoryPage(args[0] as any)
            case 'getReviewIndex': return service.getReviewIndex((args[0] as { threadId: string }).threadId)
            case 'getTurnDetail': {
                const input = args[0] as { threadId: string; turnId: string }
                return service.getTurnDetail(input.threadId, input.turnId)
            }
            case 'searchTurns': {
                const input = args[0] as { threadId: string; query: string; limit?: number }
                return service.searchTurns(input.threadId, input.query, input.limit)
            }
            case 'renameSession': return service.renameSession(args[0] as string, args[1] as string)
            case 'archiveSession': return service.archiveSession(args[0] as string, args[1] !== false)
            case 'deleteSession': return service.deleteSession(args[0] as string)
            case 'deleteMessage': return service.deleteMessage(args[0] as any)
            case 'clearLogs': return service.clearLogs(args[0] as any)
            case 'setSessionProjectPath': return service.setSessionProjectPath(args[0] as string, args[1] as string | null)
            case 'setPlaygroundRoot': return service.setPlaygroundRoot(args[0] as any)
            case 'createPlaygroundLab': return service.createPlaygroundLab(args[0] as any)
            case 'deletePlaygroundLab': return service.deletePlaygroundLab(args[0] as any)
            case 'attachSessionToPlaygroundLab': return service.attachSessionToPlaygroundLab(args[0] as any)
            case 'approvePendingPlaygroundLabRequest': return service.approvePendingPlaygroundLabRequest(args[0] as any)
            case 'declinePendingPlaygroundLabRequest': return service.declinePendingPlaygroundLabRequest(args[0] as any)
            case 'persistClipboardImage': return {
                success: true,
                path: await this.dependencies.persistClipboardImage(args[0] as any)
            }
            case 'resolveClipboardAttachment': return {
                success: true,
                path: await this.dependencies.resolveClipboardAttachment((args[0] as { reference: string }).reference)
            }
            case 'newThread': return service.newThread(args[0] as string | undefined)
            case 'sendPrompt': return service.sendPrompt(args[0] as string, args[1] as any)
            case 'interruptTurn': return service.interruptTurn(args[0] as string | undefined, args[1] as string | undefined)
            case 'respondApproval': return service.respondApproval(args[0] as any)
            case 'respondUserInput': return service.respondUserInput(args[0] as any)
            case 'getVoiceTranscriptionState': return {
                success: true,
                state: await this.dependencies.getVoiceTranscriptionState()
            }
            case 'transcribeVoice': return {
                success: true,
                text: await this.dependencies.transcribeVoice(args[0] as any)
            }
        }
    }

    private openEventStream(request: IncomingMessage, response: ServerResponse): void {
        if (this.eventResponses.size >= MAX_EVENT_CLIENTS) {
            this.writeJson(response, 429, { ok: false, error: 'Too many browser event clients are connected.' })
            return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache, no-transform')
        response.setHeader('Connection', 'keep-alive')
        response.flushHeaders()
        response.write(': connected\n\n')
        this.eventResponses.add(response)
        this.dependencies.onAssistantClientCountChanged?.(this.eventResponses.size)
        const replay = this.dependencies.service.getExternalEventReplay()
        if (replay.event || (replay.events && replay.events.length > 0)) {
            if (!response.write(this.serializeEvent(replay))) {
                this.removeEventResponse(response)
                response.end()
                return
            }
        }
        request.on('close', () => this.removeEventResponse(response))
    }

    private removeEventResponse(response: ServerResponse): void {
        if (!this.eventResponses.delete(response)) return
        this.dependencies.onAssistantClientCountChanged?.(this.eventResponses.size)
    }

    private serializeEvent(payload: AssistantEventStreamPayload): string {
        return `data: ${JSON.stringify(payload)}\n\n`
    }

    private broadcastEvent(payload: AssistantEventStreamPayload): void {
        const line = this.serializeEvent(payload)
        for (const response of [...this.eventResponses]) {
            if (response.destroyed || response.writableEnded) {
                this.removeEventResponse(response)
                continue
            }
            if (response.write(line)) continue
            this.removeEventResponse(response)
            response.end()
        }
    }

    private writeCorsHeaders(response: ServerResponse, origin: string): void {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', `Content-Type, ${BROWSER_ASSISTANT_BRIDGE_HEADER}, ${BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER}`)
        response.setHeader('Vary', 'Origin')
    }

    private writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
        response.statusCode = statusCode
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(value))
    }

    private async readJsonBody(request: IncomingMessage): Promise<unknown> {
        const chunks: Buffer[] = []
        let total = 0
        for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            total += buffer.length
            if (total > MAX_REQUEST_BYTES) throw new Error('Browser bridge request is too large.')
            chunks.push(buffer)
        }
        if (chunks.length === 0) return null
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }
}

export function getBrowserAssistantBridgeOrigins(rendererUrl: string): Set<string> {
    const url = new URL(rendererUrl)
    const origins = new Set<string>([url.origin])
    if (url.hostname === 'localhost') {
        const alternate = new URL(url.origin)
        alternate.hostname = '127.0.0.1'
        origins.add(alternate.origin)
    } else if (url.hostname === '127.0.0.1') {
        const alternate = new URL(url.origin)
        alternate.hostname = 'localhost'
        origins.add(alternate.origin)
    }
    return origins
}
