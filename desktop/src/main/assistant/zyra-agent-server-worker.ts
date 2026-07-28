import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

export type ZyraWorkerEventMetadata = {
    sequence?: number
    turnId?: string
    localThreadId?: string
    replay?: boolean
}

export type ZyraWorkerLike = {
    readonly serverOwnedLifecycle?: boolean
    onEvent(listener: (event: unknown, metadata?: ZyraWorkerEventMetadata) => void): () => void
    setControlRequestHandler(handler: (operation: unknown, signal: AbortSignal, principal?: unknown) => Promise<Record<string, unknown>>): void
    isAlive(): boolean
    request(type: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>>
    flushReplay(): void
    dispose(): void
}

type AgentServerClient = EventEmitter & {
    connect(): Promise<void>
    attach(params: Record<string, unknown>): Promise<Record<string, unknown>>
    detach(sessionKey: string): Promise<Record<string, unknown>>
    request(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>>
    setControlHandler(handler: (operation: unknown, message: Record<string, unknown>) => Promise<Record<string, unknown>>): void
    close(): void
}

type ReplayEntry = {
    sequence?: number
    event?: unknown
    requestContext?: { turnId?: string; localThreadId?: string } | null
}

export type CanonicalAgentChat = {
    canonicalChatId: string
    sessionPath: string
    project: string
    cwd: string
    title: string
    createdAt: string
    modifiedAt: string
    messageCount: number
}

export type CanonicalAgentChatHistory = {
    chat: CanonicalAgentChat
    entries: unknown[]
}

type DesktopAgentServerConnectionOptions = {
    stateDirectory?: string
    channel?: string
    autoStart?: boolean
}

export class DesktopAgentServerConnection {
    private clientPromise: Promise<AgentServerClient> | null = null
    private readonly workers = new Map<string, Set<ZyraAgentServerWorker>>()
    private readonly controlWorkers = new Map<string, ZyraAgentServerWorker>()
    private readonly pendingEvents = new Map<string, ReplayEntry[]>()
    private readonly catalogChangedListeners = new Set<() => void>()
    private disposed = false

    constructor(
        private readonly root: string,
        private readonly options: DesktopAgentServerConnectionOptions = {}
    ) {}

    onCatalogChanged(listener: () => void): () => void {
        this.catalogChangedListeners.add(listener)
        return () => this.catalogChangedListeners.delete(listener)
    }

    createWorker(cwd: string): ZyraAgentServerWorker {
        return new ZyraAgentServerWorker(this, cwd)
    }

    async listModels(forceRefresh = false): Promise<Record<string, unknown>[]> {
        const client = await this.getClient()
        const result = await client.request('runtime.models', { forceRefresh }, { timeoutMs: 65_000 })
        return Array.isArray(result['models']) ? result['models'] as Record<string, unknown>[] : []
    }

    async generateText(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        const client = await this.getClient()
        return client.request('runtime.generateText', payload)
    }

    async listCanonicalChats(project?: string): Promise<CanonicalAgentChat[]> {
        const client = await this.getClient()
        const result = await client.request('catalog.list', { project, allProjects: true, limit: 2000 })
        return Array.isArray(result['chats']) ? result['chats'] as CanonicalAgentChat[] : []
    }

    async readCanonicalChatHistory(session: string, project?: string): Promise<CanonicalAgentChatHistory | null> {
        const client = await this.getClient()
        const result = await client.request('catalog.history', { session, project, limit: 1000 })
        return asRecord(result['history']) as CanonicalAgentChatHistory | null
    }

    async attach(worker: ZyraAgentServerWorker, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        const client = await this.getClient()
        const result = await client.attach({
            project: payload['cwd'],
            cwd: payload['cwd'],
            session: payload['threadId'] || payload['providerThreadId'],
            localThreadId: payload['localThreadId'],
            model: payload['model'],
            thinking: payload['thinking'],
            profile: payload['profile'],
            noSession: payload['noSession'],
            lastSequence: worker.latestSequence
        })
        const sessionKey = String(result['sessionKey'] || result['canonicalChatId'] || '')
        if (!sessionKey) throw new Error('Zyra agent server did not return a canonical chat id.')
        worker.bindSession(sessionKey, payload)
        const attachedWorkers = this.workers.get(sessionKey) || new Set<ZyraAgentServerWorker>()
        attachedWorkers.add(worker)
        this.workers.set(sessionKey, attachedWorkers)
        const replay = [
            ...this.takePendingEvents(sessionKey),
            ...(Array.isArray(result['replay']) ? result['replay'] as ReplayEntry[] : [])
        ]
        worker.queueReplay(replay)
        const connected = asRecord(result['connected']) || {}
        const activeRequestContext = asRecord(result['activeRequestContext'])
        return {
            ...connected,
            threadId: String(result['canonicalChatId'] || connected['threadId'] || sessionKey),
            providerThreadId: String(connected['providerThreadId'] || result['canonicalChatId'] || sessionKey),
            agentServerActiveTurnId: activeRequestContext?.['turnId']
        }
    }

    async request(worker: ZyraAgentServerWorker, type: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        await this.ensureAttached(worker)
        const client = await this.getClient()
        return client.request('session.request', {
            sessionKey: worker.sessionKey,
            type,
            payload,
            ...(type === 'prompt' ? {
                requestContext: {
                    turnId: payload['turnId'],
                    localThreadId: worker.localThreadId
                }
            } : {})
        })
    }

    detach(worker: ZyraAgentServerWorker): void {
        let detachRemote = false
        if (worker.sessionKey) {
            const attachedWorkers = this.workers.get(worker.sessionKey)
            attachedWorkers?.delete(worker)
            if (!attachedWorkers || attachedWorkers.size === 0) {
                this.workers.delete(worker.sessionKey)
                detachRemote = true
            }
        }
        if (!detachRemote) return
        void this.clientPromise?.then((client) => worker.sessionKey
            ? client.detach(worker.sessionKey).catch(() => undefined)
            : undefined)
    }

    close(): void {
        if (this.disposed) return
        this.disposed = true
        void this.clientPromise?.then((client) => client.close())
        this.clientPromise = null
        this.workers.clear()
        this.controlWorkers.clear()
        this.pendingEvents.clear()
        this.catalogChangedListeners.clear()
    }

    private async ensureAttached(worker: ZyraAgentServerWorker): Promise<void> {
        if (!worker.connectPayload) throw new Error('Zyra agent-server worker is not connected.')
        const client = await this.getClient()
        await client.connect()
        await this.attach(worker, worker.connectPayload)
        worker.flushReplay()
    }

    private async getClient(): Promise<AgentServerClient> {
        if (this.disposed) throw new Error('Zyra agent-server connection is closed.')
        if (!this.clientPromise) this.clientPromise = this.createClient()
        return this.clientPromise
    }

    private async createClient(): Promise<AgentServerClient> {
        const moduleUrl = pathToFileURL(join(this.root, 'src', 'agent-server', 'client.mjs')).href
        const module = await import(/* @vite-ignore */ moduleUrl) as {
            ZyraAgentServerClient: new (options: Record<string, unknown>) => AgentServerClient
        }
        const client = new module.ZyraAgentServerClient({
            root: this.root,
            clientId: `desktop:${process.pid}:${randomUUID()}`,
            surface: 'desktop',
            authorities: ['desktop-control'],
            desktopAuthority: true,
            ...this.options
        })
        client.setControlHandler(async (operation, message) => {
            const requestId = String(message['requestId'] || '')
            const worker = [...(this.workers.get(String(message['sessionKey'] || '')) || [])].find((candidate) => candidate.isAlive())
            if (!worker) throw Object.assign(new Error('No desktop runtime is attached to this canonical chat.'), { code: 'CONTROL_DRIVER_UNAVAILABLE', retryable: true })
            this.controlWorkers.set(requestId, worker)
            try {
                return await worker.handleControlRequest(requestId, operation, message['principal'])
            } finally {
                this.controlWorkers.delete(requestId)
            }
        })
        client.on('control-cancel', (message: Record<string, unknown>) => {
            this.controlWorkers.get(String(message['requestId'] || ''))?.cancelControlRequest(String(message['requestId'] || ''))
        })
        client.on('session-event', (message: Record<string, unknown>) => this.handleSessionEvent(message))
        client.on('catalog-changed', () => {
            for (const listener of this.catalogChangedListeners) listener()
        })
        await client.connect()
        return client
    }

    private handleSessionEvent(message: Record<string, unknown>): void {
        const sessionKey = String(message['sessionKey'] || '')
        if (!sessionKey) return
        const entry: ReplayEntry = {
            sequence: Number(message['sequence']) || undefined,
            event: message['event'],
            requestContext: asRecord(message['requestContext']) as ReplayEntry['requestContext']
        }
        const workers = this.workers.get(sessionKey)
        if (workers?.size) {
            for (const worker of workers) worker.receive(entry, false)
        } else {
            const pending = this.pendingEvents.get(sessionKey) || []
            pending.push(entry)
            this.pendingEvents.set(sessionKey, pending.slice(-512))
        }
    }

    private takePendingEvents(sessionKey: string): ReplayEntry[] {
        const entries = this.pendingEvents.get(sessionKey) || []
        this.pendingEvents.delete(sessionKey)
        return entries
    }
}

export class ZyraAgentServerWorker implements ZyraWorkerLike {
    readonly serverOwnedLifecycle = true
    readonly eventListeners = new Set<(event: unknown, metadata?: ZyraWorkerEventMetadata) => void>()
    readonly controlAbortControllers = new Map<string, AbortController>()
    private replay: ReplayEntry[] = []
    private controlRequestHandler: ((operation: unknown, signal: AbortSignal, principal?: unknown) => Promise<Record<string, unknown>>) | null = null
    private disposed = false
    sessionKey: string | null = null
    localThreadId: string | null = null
    latestSequence = 0
    connectPayload: Record<string, unknown> | null = null

    constructor(private readonly connection: DesktopAgentServerConnection, readonly cwd: string) {}

    onEvent(listener: (event: unknown, metadata?: ZyraWorkerEventMetadata) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    setControlRequestHandler(handler: (operation: unknown, signal: AbortSignal, principal?: unknown) => Promise<Record<string, unknown>>): void {
        this.controlRequestHandler = handler
    }

    isAlive(): boolean {
        return !this.disposed && Boolean(this.sessionKey)
    }

    async request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        if (this.disposed) throw new Error('Zyra agent-server worker is detached.')
        if (type === 'connect') return this.connection.attach(this, payload)
        return this.connection.request(this, type, payload)
    }

    bindSession(sessionKey: string, payload: Record<string, unknown>): void {
        this.sessionKey = sessionKey
        this.localThreadId = String(payload['localThreadId'] || this.localThreadId || '') || null
        this.connectPayload = { ...payload, threadId: sessionKey, providerThreadId: sessionKey }
    }

    queueReplay(entries: ReplayEntry[]): void {
        this.replay.push(...entries)
        this.replay.sort((left, right) => (Number(left.sequence) || 0) - (Number(right.sequence) || 0))
    }

    flushReplay(): void {
        const replay = this.replay
        this.replay = []
        for (const entry of replay) this.receive(entry, true)
    }

    receive(entry: ReplayEntry, replay: boolean): void {
        const sequence = Number(entry.sequence) || 0
        if (sequence && sequence <= this.latestSequence) return
        if (sequence) this.latestSequence = sequence
        const metadata: ZyraWorkerEventMetadata = {
            ...(sequence ? { sequence } : {}),
            ...(entry.requestContext?.turnId ? { turnId: entry.requestContext.turnId } : {}),
            ...(entry.requestContext?.localThreadId ? { localThreadId: entry.requestContext.localThreadId } : {}),
            ...(replay ? { replay: true } : {})
        }
        for (const listener of this.eventListeners) listener(entry.event, metadata)
    }

    async handleControlRequest(requestId: string, operation: unknown, principal?: unknown): Promise<Record<string, unknown>> {
        const controller = new AbortController()
        this.controlAbortControllers.set(requestId, controller)
        try {
            if (!this.controlRequestHandler) throw Object.assign(new Error('Desktop control authority is not bound to this chat.'), { code: 'CONTROL_DRIVER_UNAVAILABLE' })
            return await this.controlRequestHandler(operation, controller.signal, principal)
        } finally {
            this.controlAbortControllers.delete(requestId)
        }
    }

    cancelControlRequest(requestId: string): void {
        this.controlAbortControllers.get(requestId)?.abort()
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        for (const controller of this.controlAbortControllers.values()) controller.abort()
        this.controlAbortControllers.clear()
        this.connection.detach(this)
        this.eventListeners.clear()
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}
