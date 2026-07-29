import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { ControlAuditEvent } from '../../shared/agent-control/contracts'
import { CONTROL_BOUNDS } from '../../shared/agent-control/policy'
import { redactAuditEvent } from './redaction'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export class AuditStore {
    private readonly events: ControlAuditEvent[] = []
    private readonly filePath: string | null

    constructor(userDataPath?: string) {
        this.filePath = userDataPath ? join(userDataPath, 'agent-control', 'audit-v1.json') : null
        this.load()
    }

    append(event: Omit<ControlAuditEvent, 'version' | 'auditId' | 'occurredAt'> & { occurredAt?: string }): ControlAuditEvent {
        const redacted = redactAuditEvent({
            ...event,
            version: 1,
            auditId: `control-audit:${randomUUID()}`,
            occurredAt: event.occurredAt || new Date().toISOString()
        })
        this.events.push(redacted)
        this.prune()
        this.persist()
        return redacted
    }

    list(limit = 200): ControlAuditEvent[] {
        this.prune()
        return this.events.slice(-Math.max(1, Math.min(CONTROL_BOUNDS.maxAuditEntries, limit))).reverse()
    }

    clear(): void {
        this.events.splice(0)
        this.persist()
    }

    private prune(): void {
        const cutoff = Date.now() - RETENTION_MS
        const retained = this.events.filter((event) => Date.parse(event.occurredAt) >= cutoff)
        this.events.splice(0, this.events.length, ...retained.slice(-CONTROL_BOUNDS.maxAuditEntries))
    }

    private load(): void {
        if (!this.filePath) return
        try {
            const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
            if (!Array.isArray(parsed)) return
            for (const event of parsed.slice(-CONTROL_BOUNDS.maxAuditEntries)) {
                if (!event || typeof event !== 'object' || (event as { version?: unknown }).version !== 1) continue
                this.events.push(redactAuditEvent(event as ControlAuditEvent))
            }
            this.prune()
        } catch {
            // Missing or malformed audit data starts a clean, inactive control session.
        }
    }

    private persist(): void {
        if (!this.filePath) return
        try {
            mkdirSync(dirname(this.filePath), { recursive: true })
            const temporary = `${this.filePath}.tmp`
            writeFileSync(temporary, JSON.stringify(this.events, null, 2), { encoding: 'utf8', mode: 0o600 })
            renameSync(temporary, this.filePath)
        } catch {
            // Auditing remains in memory when the local persistence path is unavailable.
        }
    }
}
