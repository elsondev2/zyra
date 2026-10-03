import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Database } from 'sql.js/dist/sql-asm.js'
import type { AssistantTranscribeVoiceInput, AssistantVoiceHistoryEntry } from '../../shared/assistant/contracts'
import { openNativeSqliteDatabase } from './native-sqlite-adapter'
import { decodeCodexVoiceInput, transcribeVoiceWithCodex } from './codex-voice-transcription'

let databasePromise: Promise<Database> | null = null

async function database(): Promise<Database> {
    if (!databasePromise) databasePromise = (async () => {
        const directory = join(app.getPath('userData'), 'assistant')
        await mkdir(directory, { recursive: true })
        const db = await openNativeSqliteDatabase(join(directory, 'voice-history.sqlite'))
        db.run('PRAGMA secure_delete = ON')
        db.run(`CREATE TABLE IF NOT EXISTS voice_history (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            engine TEXT NOT NULL CHECK (engine IN ('browser', 'codex')),
            status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
            duration_ms INTEGER NOT NULL,
            transcript TEXT,
            error TEXT,
            failed_audio BLOB
        )`)
        db.run('CREATE INDEX IF NOT EXISTS voice_history_created ON voice_history(created_at DESC)')
        return db
    })().catch(error => { databasePromise = null; throw error })
    return databasePromise
}

export async function saveVoiceHistory(input: {
    engine: 'browser' | 'codex'
    recording: AssistantTranscribeVoiceInput
    transcript?: string
    error?: string
}): Promise<void> {
    const audio = decodeCodexVoiceInput(input.recording)
    const transcript = input.transcript?.trim() || null
    const failed = !transcript
    const db = await database()
    db.run('INSERT INTO voice_history (id, created_at, engine, status, duration_ms, transcript, error, failed_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        randomUUID(), new Date().toISOString(), input.engine, failed ? 'failed' : 'success',
        input.recording.durationMs, transcript, failed ? input.error?.slice(0, 1000) || 'Transcription failed.' : null,
        failed ? audio : null
    ])
}

export async function listVoiceHistory(): Promise<AssistantVoiceHistoryEntry[]> {
    const db = await database()
    const rows = db.exec('SELECT id, created_at, engine, status, duration_ms, transcript, error, failed_audio IS NOT NULL FROM voice_history ORDER BY created_at DESC LIMIT 200')[0]?.values || []
    return rows.map(row => ({
        id: String(row[0]), createdAt: String(row[1]), engine: row[2] === 'browser' ? 'browser' : 'codex',
        status: row[3] === 'success' ? 'success' : 'failed', durationMs: Number(row[4]),
        transcript: typeof row[5] === 'string' ? row[5] : null,
        error: typeof row[6] === 'string' ? row[6] : null, hasRecording: Boolean(row[7])
    }))
}

export async function getFailedVoiceRecording(id: string): Promise<string | null> {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null
    const db = await database()
    const value = db.exec('SELECT failed_audio FROM voice_history WHERE id = ? AND status = ?', [id, 'failed'])[0]?.values?.[0]?.[0]
    return value instanceof Uint8Array ? Buffer.from(value).toString('base64') : null
}

export async function deleteVoiceHistory(id: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid voice history entry.')
    const db = await database()
    db.run('DELETE FROM voice_history WHERE id = ?', [id])
    db.run('PRAGMA wal_checkpoint(TRUNCATE)')
}

export async function transcribeVoiceAndSave(input: AssistantTranscribeVoiceInput, signal?: AbortSignal): Promise<string> {
    try {
        const text = await transcribeVoiceWithCodex(input, signal)
        await saveVoiceHistory({ engine: 'codex', recording: input, transcript: text })
        return text
    } catch (error) {
        await saveVoiceHistory({ engine: 'codex', recording: input, error: error instanceof Error ? error.message : 'Voice transcription failed.' })
        throw error
    }
}
