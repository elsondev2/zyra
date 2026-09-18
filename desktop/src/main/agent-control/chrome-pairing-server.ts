import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { EventEmitter } from 'events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { ControlPairingState } from '../../shared/agent-control/contracts'
import { CONTROL_BOUNDS } from '../../shared/agent-control/policy'
import { AgentControlError } from './control-errors'

const MAX_REQUEST_BYTES = 512 * 1024
const PAIRING_TTL_MS = 5 * 60 * 1000
const SESSION_IDLE_MS = 20_000
const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_REQUESTS_PER_SECOND = 30

type PendingPair = { sessionId: string; extensionId: string; nonce: string; challenge: string; expiresAt: number }
type PairSession = { lastSeenAt: number; instanceId?: string; pairId: string; extensionId: string; token: string; expiresAt: number; requests: Array<{ requestId: string; operation: unknown; deadline?: number }> }
type PendingDriverRequest = { pairId: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }

export type ChromePairingEvent =
    | { type: 'tab.register'; browserName?: string; pairId: string; extensionId: string; tabId: number; url: string; title: string; documentId: string; mode?: 'read' | 'control' }
    | { type: 'tab.closed'; pairId: string; tabId: number }
    | { type: 'session.disconnected'; pairId: string; reason: string }

export class ChromePairingServer extends EventEmitter {
    resolveTabTarget?: (pairId: string, tabId: number) => string | undefined
    private server: Server | null = null
    private pairingCode = ''
    private pairingExpiresAt = 0
    private currentState: ControlPairingState = { state: 'stopped' }
    private readonly pendingPairs = new Map<string, PendingPair>()
    private readonly sessions = new Map<string, PairSession>()
    private readonly pendingDriver = new Map<string, PendingDriverRequest>()
    private appearance: Record<string, unknown> = {}
    private heartbeatTimer: NodeJS.Timeout | null = null
    private automaticConnectionBlocked = false
    private automaticStart: Promise<ControlPairingState> | null = null

    connectedSessionIds(): string[] { return [...this.sessions.keys()] }

    setAppearance(appearance: Record<string, unknown>): void { this.appearance = appearance }

    private readonly rates = new Map<string, { second: number; count: number }>()

    state(): ControlPairingState {
        if (this.currentState.expiresAt && Date.parse(this.currentState.expiresAt) <= Date.now() && this.currentState.state === 'waiting') {
            void this.stop('pairing-expired')
        }
        return { ...this.currentState, automaticConnectionPaused: this.automaticConnectionBlocked }
    }

    async start(): Promise<ControlPairingState> {
        await this.stop('restart')
        this.automaticConnectionBlocked = false
        this.pairingCode = String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(8, '0')
        this.pairingExpiresAt = Date.now() + PAIRING_TTL_MS
        this.server = createServer((request, response) => void this.handle(request, response))
        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject)
            this.server!.listen(0, '127.0.0.1', () => resolve())
        })
        const address = this.server.address()
        if (!address || typeof address === 'string') throw new Error('Chrome pairing server did not acquire a loopback port.')
        this.currentState = {
            state: 'waiting',
            code: this.pairingCode,
            port: address.port,
            expiresAt: new Date(this.pairingExpiresAt).toISOString()
        }
        this.heartbeatTimer = setInterval(() => this.sweepInactiveSessions(), 5000)
        this.heartbeatTimer.unref?.()
        return this.state()
    }

    async stop(reason = 'stopped'): Promise<void> {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
        if (reason === 'emergency-stop' || reason === 'user-request') this.automaticConnectionBlocked = true
        const sessions = [...this.sessions.values()]
        this.sessions.clear()
        this.pendingPairs.clear()
        for (const pending of this.pendingDriver.values()) {
            clearTimeout(pending.timer)
            pending.reject(new AgentControlError('CONTROL_CANCELLED', `Chrome pairing stopped: ${reason}`))
        }
        this.pendingDriver.clear()
        if (this.server) {
            const server = this.server
            this.server = null
            await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined)
        }
        for (const session of sessions) this.emitEvent({ type: 'session.disconnected', pairId: session.pairId, reason })
        this.currentState = { state: 'stopped' }
        this.pairingCode = ''
        this.pairingExpiresAt = 0
    }

    sweepInactiveSessions(now = Date.now()): void {
        const expired = [...this.sessions.values()].filter(session => now - session.lastSeenAt > SESSION_IDLE_MS || session.expiresAt <= now)
        if (!expired.length) return
        for (const session of expired) {
            this.sessions.delete(session.pairId)
            for (const [id, pending] of this.pendingDriver) {
                if (pending.pairId !== session.pairId) continue
                this.pendingDriver.delete(id); clearTimeout(pending.timer)
                pending.reject(new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'The Chrome browser disconnected.'))
            }
            this.emitEvent({type:'session.disconnected', pairId:session.pairId, reason:'browser-offline'})
        }
        const current = [...this.sessions.values()].at(-1)
        this.currentState = current
            ? {state:'paired', pairId:current.pairId, extensionId:current.extensionId, port:this.currentState.port}
            : {state:'stopped', port:this.currentState.port}
        this.emit('state-changed')
    }

    // Called only by the host after verifying the exact extension origin.
    async connectExtension(extensionId: string, instanceId: string) {
        if (!/^[a-p]{32}$/.test(extensionId) || !/^[a-zA-Z0-9_-]{16,128}$/.test(instanceId)) throw new Error('Invalid browser identity.')
        if (this.automaticConnectionBlocked) throw new Error('Chrome access is paused in Zyra. Resume it in Device connections.')
        this.checkRate(extensionId)
        this.sweepInactiveSessions()
        if (this.sessions.size >= 16 && ![...this.sessions.values()].some(entry => entry.instanceId === instanceId && entry.extensionId === extensionId)) throw new Error('Too many connected Chrome profiles.')
        if (!this.server) {
            this.automaticStart ||= this.start().finally(() => { this.automaticStart = null })
            await this.automaticStart
        }
        const previous = [...this.sessions.values()].find(entry => entry.extensionId === extensionId && entry.instanceId === instanceId)
        if (previous) {
            this.sessions.delete(previous.pairId)
            this.emitEvent({ type: 'session.disconnected', pairId: previous.pairId, reason: 'browser-reconnected' })
        }
        const pairId = `chrome-pair:${randomUUID()}`
        const token = randomBytes(32).toString('base64url')
        const expiresAt = Date.now() + SESSION_TTL_MS
        this.sessions.set(pairId, { lastSeenAt:Date.now(), pairId, extensionId, instanceId, token, expiresAt, requests: [] })
        const address = this.server!.address()
        if (!address || typeof address === 'string') throw new Error('Chrome connection is unavailable.')
        this.currentState = { state: 'paired', pairId, port: address.port, extensionId }
        this.emit('state-changed')
        return { port: address.port, pairId, token, expiresAt: new Date(expiresAt).toISOString() }
    }

    async request(pairId: string, operation: unknown, timeoutMs: number = CONTROL_BOUNDS.defaultActionTimeoutMs, signal?: AbortSignal): Promise<unknown> {
        signal?.throwIfAborted()
        const session = [...this.sessions.values()].find((entry) => entry.pairId === pairId)
        if (!session || session.expiresAt <= Date.now()) throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'The Chrome extension is disconnected.', { retryable: true })
        if (session.requests.length >= CONTROL_BOUNDS.maxPendingPairingRequests) throw new AgentControlError('CONTROL_QUEUE_FULL', 'Too many Chrome extension requests are pending.', { retryable: true })
        const requestId = `chrome-request:${randomUUID()}`
        session.requests.push({ requestId, operation, deadline: Date.now() + timeoutMs })
        return new Promise((resolve, reject) => {
            const cancel = (error: Error) => {
                if (!this.pendingDriver.delete(requestId)) return
                const queued = session.requests.findIndex((entry) => entry.requestId === requestId)
                if (queued >= 0) session.requests.splice(queued, 1)
                else if (session.requests.length < CONTROL_BOUNDS.maxPendingPairingRequests) session.requests.push({ requestId: `cancel:${requestId}`, operation: { type: 'cancel', requestId }, deadline: Date.now() + 5000 })
                finish(); reject(error)
            }
            const abort = () => cancel(new AgentControlError('CONTROL_CANCELLED', 'Chrome action cancelled.'))
            const timer = setTimeout(() => cancel(new AgentControlError('CONTROL_TIMEOUT', 'Chrome extension request timed out. Observe the page before retrying.')), timeoutMs)
            const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
            this.pendingDriver.set(requestId, { pairId, resolve: (value) => { finish(); resolve(value) }, reject: (error) => { finish(); reject(error) }, timer })
            signal?.addEventListener('abort', abort, { once: true })
            if (signal?.aborted) abort()
        })
    }

    private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        try {
            const remote = request.socket.remoteAddress
            if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return this.reply(response, 403, { error: 'loopback-required' })
            if (request.method !== 'POST') return this.reply(response, 405, { error: 'post-required' })
            const origin = String(request.headers.origin || '')
            if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return this.reply(response, 403, { error: 'extension-origin-required' })
            this.checkRate(origin)
            const body = await readJson(request)
            if (request.url === '/v1/pair/hello') return this.pairHello(origin, body, response)
            if (request.url === '/v1/pair/prove') return this.pairProve(origin, body, response)
            const session = this.authenticate(origin, request.headers.authorization)
            const nextToken = randomBytes(32).toString('base64url')
            session.lastSeenAt = Date.now()
            session.token = nextToken
            session.expiresAt = Date.now() + SESSION_TTL_MS
            if (request.url === '/v1/poll') {
                const requests = session.requests.splice(0, CONTROL_BOUNDS.maxPendingPairingRequests)
                return this.reply(response, 200, { nextToken, requests, appearance: this.appearance })
            }
            if (request.url === '/v1/respond') {
                const requestId = String(body.requestId || '')
                const pending = this.pendingDriver.get(requestId)
                if (!pending || pending.pairId !== session.pairId) return this.reply(response, 409, { error: 'unknown-or-late-request', nextToken })
                clearTimeout(pending.timer)
                this.pendingDriver.delete(requestId)
                if (body.ok === false) pending.reject(new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', String(body.error || 'Chrome extension action failed.'), { retryable: false }))
                else pending.resolve(body.result)
                return this.reply(response, 200, { ok: true, nextToken })
            }
            if (request.url === '/v1/event') {
                this.handleExtensionEvent(session, body)
                const targetId = body.type === 'tab.register' ? this.resolveTabTarget?.(session.pairId, Number(body.tabId)) : undefined
                const targets = body.type === 'tabs.discover' && Array.isArray(body.tabs) ? body.tabs.map(tab => ({tabId:Number(tab.tabId), targetId:this.resolveTabTarget?.(session.pairId, Number(tab.tabId))})) : undefined
                return this.reply(response, 200, { ok: true, nextToken, targetId, targets })
            }
            return this.reply(response, 404, { error: 'unknown-route', nextToken })
        } catch (error) {
            this.reply(response, error instanceof AgentControlError ? 403 : 400, { error: error instanceof Error ? error.message : 'invalid-request' })
        }
    }

    private pairHello(origin: string, body: Record<string, unknown>, response: ServerResponse): void {
        if (Date.now() >= this.pairingExpiresAt || String(body.code || '') !== this.pairingCode) return this.reply(response, 403, { error: 'invalid-or-expired-code' })
        const extensionId = String(body.extensionId || '')
        const nonce = String(body.nonce || '')
        if (origin !== `chrome-extension://${extensionId}` || !/^[a-p]{32}$/.test(extensionId) || !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) return this.reply(response, 403, { error: 'invalid-extension-proof' })
        const sessionId = `pair-challenge:${randomUUID()}`
        const challenge = randomBytes(32).toString('base64url')
        this.pendingPairs.set(sessionId, { sessionId, extensionId, nonce, challenge, expiresAt: Date.now() + 60_000 })
        this.reply(response, 200, { protocolVersion: 1, sessionId, challenge })
    }

    private pairProve(origin: string, body: Record<string, unknown>, response: ServerResponse): void {
        const pending = this.pendingPairs.get(String(body.sessionId || ''))
        if (!pending || pending.expiresAt <= Date.now() || origin !== `chrome-extension://${pending.extensionId}`) return this.reply(response, 403, { error: 'pairing-challenge-expired' })
        const expected = createHmac('sha256', this.pairingCode).update(`${pending.nonce}:${pending.challenge}`).digest()
        const suppliedText = String(body.proof || '')
        let supplied: Buffer
        try { supplied = Buffer.from(suppliedText, 'base64url') } catch { return this.reply(response, 403, { error: 'invalid-proof' }) }
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return this.reply(response, 403, { error: 'invalid-proof' })
        this.pendingPairs.delete(pending.sessionId)
        const pairId = `chrome-pair:${randomUUID()}`
        const token = randomBytes(32).toString('base64url')
        this.sessions.set(pairId, { lastSeenAt:Date.now(), pairId, extensionId: pending.extensionId, token, expiresAt: Date.now() + SESSION_TTL_MS, requests: [] })
        this.currentState = { state: 'paired', pairId, port: this.currentState.port, extensionId: pending.extensionId }
        this.reply(response, 200, { protocolVersion: 1, pairId, token, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
    }

    private authenticate(origin: string, authorization: string | undefined): PairSession {
        const extensionId = origin.slice('chrome-extension://'.length)
        const supplied = String(authorization || '').replace(/^Bearer\s+/i, '')
        const session = [...this.sessions.values()].find(entry => entry.extensionId === extensionId && Buffer.byteLength(entry.token) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(entry.token), Buffer.from(supplied)))
        if (!session || session.expiresAt <= Date.now() || supplied.length !== session.token.length) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Chrome pairing credential is invalid or expired.')
        const left = Buffer.from(supplied)
        const right = Buffer.from(session.token)
        if (!timingSafeEqual(left, right)) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Chrome pairing credential is invalid or expired.')
        return session
    }

    private handleExtensionEvent(session: PairSession, body: Record<string, unknown>): void {
        const type = String(body.type || '')
        if (type === 'session.disconnect') {
            this.sessions.delete(session.pairId)
            if (this.currentState.state === 'paired' && this.currentState.pairId === session.pairId) {
                const remaining = this.sessions.values().next().value as PairSession | undefined
                this.currentState = remaining
                    ? { state: 'paired', pairId: remaining.pairId, port: this.currentState.port, extensionId: remaining.extensionId }
                    : { state: 'stopped', port: this.currentState.port }
            }
            if (this.sessions.size === 0) {
                this.pairingCode = ''
                this.pairingExpiresAt = 0
            }
            this.emitEvent({ type: 'session.disconnected', pairId: session.pairId, reason: 'extension-disconnected' })
            this.emit('state-changed')
            return
        }
        if (type === 'tabs.discover') {
            if (!Array.isArray(body.tabs) || body.tabs.length > 200) throw new Error('Invalid Chrome tab catalog.')
            for (const tab of body.tabs) {
                if (!tab || typeof tab !== 'object') throw new Error('Invalid Chrome tab catalog entry.')
                this.handleExtensionEvent(session, {...tab, type:'tab.register'})
            }
            return
        }
        if (type === 'tab.register') {
            const tabId = Number(body.tabId)
            const url = String(body.url || '')
            if (!Number.isInteger(tabId) || tabId < 0 || !/^https?:\/\//.test(url)) throw new Error('Invalid exact-tab registration.')
            this.emitEvent({
                type, pairId: session.pairId, extensionId: session.extensionId, tabId,
                url, browserName: String(body.browserName || 'Chrome').slice(0,60), mode: body.mode === 'read' ? 'read' : 'control', title: String(body.title || '').slice(0, 512), documentId: String(body.documentId || '').slice(0, 192)
            })
            return
        }
        if (type === 'tab.closed') {
            const tabId = Number(body.tabId)
            if (Number.isInteger(tabId)) this.emitEvent({ type, pairId: session.pairId, tabId })
            return
        }
        throw new Error('Unknown extension event.')
    }

    private checkRate(key: string): void {
        const second = Math.floor(Date.now() / 1000)
        const rate = this.rates.get(key)
        if (!rate || rate.second !== second) {
            this.rates.set(key, { second, count: 1 })
            return
        }
        rate.count += 1
        if (rate.count > MAX_REQUESTS_PER_SECOND) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Chrome pairing rate limit exceeded.')
    }

    private emitEvent(event: ChromePairingEvent): void {
        this.emit('extension-event', event)
    }

    private reply(response: ServerResponse, status: number, body: unknown): void {
        const encoded = JSON.stringify(body)
        response.writeHead(status, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(encoded),
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff'
        })
        response.end(encoded)
    }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_REQUEST_BYTES) throw new Error('request-too-large')
        chunks.push(buffer)
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object-body-required')
    return parsed as Record<string, unknown>
}
