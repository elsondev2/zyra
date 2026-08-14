import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AssistantRealtimeVoiceEvent } from '../shared/assistant/contracts'

const EVENT_HEARTBEAT = ': heartbeat\n\n'
const MAX_EVENT_CLIENTS = 4
const MAX_EVENT_JOURNAL_ITEMS = 256
const MAX_EVENT_JOURNAL_BYTES = 512 * 1024
const MAX_EVENT_JOURNAL_AGE_MS = 2 * 60_000

type JournalEntry = {
    clientId: string
    line: string
    bytes: number
    createdAt: number
}

export type BrowserRealtimeVoiceStreamEvent = {
    streamId: string
    sequence: number
    event: AssistantRealtimeVoiceEvent
}

export class BrowserRealtimeVoiceEventStream {
    private readonly responsesByClientId = new Map<string, Set<ServerResponse>>()
    private readonly streamId = randomUUID()
    private readonly journal: JournalEntry[] = []
    private journalBytes = 0
    private sequence = 0
    private onClientCountChanged: ((clientId: string, count: number) => void) | null = null

    setClientCountListener(listener: (clientId: string, count: number) => void): void {
        this.onClientCountChanged = listener
    }

    hasClient(clientId: string): boolean {
        return (this.responsesByClientId.get(clientId)?.size || 0) > 0
    }

    open(clientId: string, request: IncomingMessage, response: ServerResponse): void {
        if (this.totalResponseCount() >= MAX_EVENT_CLIENTS) {
            this.writeJson(response, 429, { ok: false, error: 'Too many browser Voice event clients are connected.' })
            return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache, no-transform')
        response.setHeader('Connection', 'keep-alive')
        response.flushHeaders()
        response.write(': connected\n\n')
        const responses = this.responsesByClientId.get(clientId) || new Set<ServerResponse>()
        responses.add(response)
        this.responsesByClientId.set(clientId, responses)
        this.onClientCountChanged?.(clientId, responses.size)
        this.pruneJournal()
        const replay = this.journal
            .filter((entry) => entry.clientId === clientId)
            .map((entry) => entry.line)
            .join('')
        if (replay) response.write(replay)
        request.on('close', () => this.remove(clientId, response))
    }

    broadcast(clientId: string, event: AssistantRealtimeVoiceEvent): void {
        const payload: BrowserRealtimeVoiceStreamEvent = {
            streamId: this.streamId,
            sequence: ++this.sequence,
            event
        }
        const line = `data: ${JSON.stringify(payload)}\n\n`
        this.appendJournal(clientId, line)
        for (const response of [...(this.responsesByClientId.get(clientId) || [])]) {
            if (response.destroyed || response.writableEnded) {
                this.remove(clientId, response)
                continue
            }
            if (response.write(line)) continue
            this.remove(clientId, response)
            response.end()
        }
    }

    heartbeat(): void {
        for (const [clientId, responses] of this.responsesByClientId) {
            for (const response of [...responses]) {
                if (response.write(EVENT_HEARTBEAT)) continue
                this.remove(clientId, response)
                response.end()
            }
        }
    }

    clearClient(clientId: string): void {
        for (let index = this.journal.length - 1; index >= 0; index -= 1) {
            const entry = this.journal[index]
            if (entry.clientId !== clientId) continue
            this.journal.splice(index, 1)
            this.journalBytes -= entry.bytes
        }
    }

    stop(): void {
        for (const [clientId, responses] of this.responsesByClientId) {
            for (const response of responses) response.end()
            this.onClientCountChanged?.(clientId, 0)
        }
        this.responsesByClientId.clear()
        this.journal.length = 0
        this.journalBytes = 0
    }

    private appendJournal(clientId: string, line: string): void {
        const bytes = Buffer.byteLength(line)
        const createdAt = Date.now()
        this.pruneJournal(createdAt)
        this.journal.push({ clientId, line, bytes, createdAt })
        this.journalBytes += bytes
        while (
            this.journal.length > MAX_EVENT_JOURNAL_ITEMS
            || this.journalBytes > MAX_EVENT_JOURNAL_BYTES
        ) {
            const removed = this.journal.shift()
            if (!removed) break
            this.journalBytes -= removed.bytes
        }
    }

    private pruneJournal(now = Date.now()): void {
        const cutoff = now - MAX_EVENT_JOURNAL_AGE_MS
        while (this.journal.length > 0 && this.journal[0].createdAt < cutoff) {
            const removed = this.journal.shift()
            if (!removed) break
            this.journalBytes -= removed.bytes
        }
    }

    private remove(clientId: string, response: ServerResponse): void {
        const responses = this.responsesByClientId.get(clientId)
        if (!responses?.delete(response)) return
        if (responses.size === 0) this.responsesByClientId.delete(clientId)
        this.onClientCountChanged?.(clientId, responses.size)
    }

    private totalResponseCount(): number {
        let count = 0
        for (const responses of this.responsesByClientId.values()) count += responses.size
        return count
    }

    private writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
        response.statusCode = statusCode
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(value))
    }
}
