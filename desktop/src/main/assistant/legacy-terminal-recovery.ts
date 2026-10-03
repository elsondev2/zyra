import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { AssistantSnapshot } from '../../shared/assistant/contracts'
import { readTerminalAssistantMessageOutcome, resolveZyraTerminalOutcome, type TerminalAssistantMessageOutcome } from './assistant-terminal-outcome'

// Match the bounded canonical journal tail. Missing or truncated evidence never
// changes a failure; recovery requires the exact saved turn's terminal event.
const MAX_JOURNAL_TAIL_BYTES = 9 * 1024 * 1024

export function readLegacyInterruptedTurn(directory: string, providerThreadId: string, turnId: string): boolean {
    let content: string
    let fd: number | undefined
    try {
        const hash = createHash('sha256').update(providerThreadId).digest('hex')
        fd = openSync(join(directory, `${hash}.jsonl`), 'r')
        const size = fstatSync(fd).size
        const length = Math.min(size, MAX_JOURNAL_TAIL_BYTES)
        const bytes = Buffer.alloc(length)
        const read = readSync(fd, bytes, 0, length, size - length)
        content = bytes.subarray(0, read).toString('utf8')
        if (size > length) content = content.slice(content.indexOf('\n') + 1)
    } catch { return false } finally { if (fd !== undefined) closeSync(fd) }

    let messageOutcome: TerminalAssistantMessageOutcome | null = null
    let interrupted = false
    for (const line of content.split(/\r?\n/)) {
        let entry: any
        try { entry = JSON.parse(line) } catch { continue }
        const event = entry?.event
        if (!event || (entry.requestContext?.turnId || event.turnId) !== turnId) continue
        if (event.type === 'message_end' && event.message?.role === 'assistant') {
            const outcome = readTerminalAssistantMessageOutcome(event.message, 'legacy-terminal')
            messageOutcome = outcome ? { ...outcome, turnId } : null
        }
        if (event.type === 'agent_end' || event.type === 'zyra_server_turn_completed') {
            if (event.willRetry === true) continue
            if (event.outcome === 'completed') { interrupted = false; continue }
            const latest = Array.isArray(event.messages) ? event.messages.findLast((message: any) => message?.role === 'assistant') : null
            if (latest) {
                const outcome = readTerminalAssistantMessageOutcome(latest, 'legacy-terminal')
                messageOutcome = outcome ? { ...outcome, turnId } : null
            }
            const eventOutcome = readTerminalAssistantMessageOutcome({ stopReason: event.outcome === 'failed' ? 'error' : event.outcome, errorMessage: event.errorMessage }, 'legacy-terminal')
            interrupted = resolveZyraTerminalOutcome(event.type, event, messageOutcome || (eventOutcome ? { ...eventOutcome, turnId } : null)) === 'interrupted'
        }
    }
    return interrupted
}

export function recoverLegacyAssistantInterruptions(snapshot: AssistantSnapshot, journalDirectory: string): AssistantSnapshot {
    for (const session of snapshot.sessions) {
        for (const thread of session.threads) {
            const turn = thread.latestTurn
            if (!thread.providerThreadId || turn?.state !== 'error' || thread.state === 'running' || thread.state === 'starting' || thread.state === 'waiting') continue
            if (!readLegacyInterruptedTurn(journalDirectory, thread.providerThreadId, turn.id)) continue
            thread.latestTurn = { ...turn, state: 'interrupted' }
            if (thread.canonicalPresence?.latestTurn?.id === turn.id) {
                thread.canonicalPresence = { ...thread.canonicalPresence, latestTurn: { ...thread.canonicalPresence.latestTurn, state: 'interrupted' } }
            }
            thread.lastError = null
            if (thread.state === 'error') thread.state = 'ready'
        }
    }
    return snapshot
}
