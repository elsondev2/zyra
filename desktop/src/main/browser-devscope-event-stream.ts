import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BrowserDevscopeRelayEvent, BrowserDevscopeStreamEvent } from '../shared/browser-assistant-bridge'

const EVENT_HEARTBEAT = ': heartbeat\n\n'
const MAX_EVENT_CLIENTS = 4
const MAX_EVENT_JOURNAL_ITEMS = 512
const MAX_EVENT_JOURNAL_BYTES = 4 * 1024 * 1024
const MAX_EVENT_JOURNAL_AGE_MS = 2 * 60_000

type JournalEntry = {
    event: BrowserDevscopeRelayEvent['event']
    line: string
    bytes: number
    createdAt: number
}

export class BrowserDevscopeEventStream {
    private readonly responses = new Set<ServerResponse>()
    private readonly streamId = randomUUID()
    private readonly journal: JournalEntry[] = []
    private journalBytes = 0
    private sequence = 0

    open(request: IncomingMessage, response: ServerResponse): void {
        if (this.responses.size >= MAX_EVENT_CLIENTS) {
            this.writeJson(response, 429, { ok: false, error: 'Too many browser action event clients are connected.' })
            return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache, no-transform')
        response.setHeader('Connection', 'keep-alive')
        response.flushHeaders()
        response.write(': connected\n\n')
        this.responses.add(response)
        this.pruneJournal()
        if (this.journal.length > 0) response.write(this.journal.map((entry) => entry.line).join(''))
        request.on('close', () => this.remove(response))
    }

    broadcast(event: BrowserDevscopeRelayEvent): void {
        const streamEvent: BrowserDevscopeStreamEvent = {
            ...event,
            streamId: this.streamId,
            sequence: ++this.sequence
        }
        const line = `data: ${JSON.stringify(streamEvent)}\n\n`
        this.appendJournal(event.event, line)
        for (const response of [...this.responses]) {
            if (response.destroyed || response.writableEnded) {
                this.remove(response)
                continue
            }
            if (response.write(line)) continue
            this.remove(response)
            response.end()
        }
    }

    heartbeat(): void {
        for (const response of [...this.responses]) {
            if (response.write(EVENT_HEARTBEAT)) continue
            this.remove(response)
            response.end()
        }
    }

    stop(): void {
        for (const response of this.responses) response.end()
        this.responses.clear()
        this.journal.length = 0
        this.journalBytes = 0
    }

    private appendJournal(event: BrowserDevscopeRelayEvent['event'], line: string): void {
        const bytes = Buffer.byteLength(line)
        const createdAt = Date.now()
        this.pruneJournal(createdAt)
        if (event === 'agentControlCursor' || event === 'agentControlState') {
            let previousIndex = -1
            for (let index = this.journal.length - 1; index >= 0; index -= 1) {
                if (this.journal[index].event !== event) continue
                previousIndex = index
                break
            }
            if (previousIndex >= 0) {
                const [removed] = this.journal.splice(previousIndex, 1)
                this.journalBytes -= removed.bytes
            }
        }
        this.journal.push({ event, line, bytes, createdAt })
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

    private remove(response: ServerResponse): void {
        this.responses.delete(response)
    }

    private writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
        response.statusCode = statusCode
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(value))
    }
}
