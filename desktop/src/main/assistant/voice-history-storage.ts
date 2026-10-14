import type { Database } from 'sql.js/dist/sql-asm.js'

export const MAX_FAILED_VOICE_HISTORY_BYTES = 64 * 1024 * 1024
export const MAX_FAILED_VOICE_HISTORY_RECORDINGS = 20
const STORAGE_FULL_MESSAGE = 'Recording not saved because Voice history storage is full. Delete old recordings in Settings to free space.'

/** Bound new retained audio without deleting existing user recordings. */
export function insertVoiceHistoryEntry(db: Database, input: {
    id: string
    createdAt: string
    engine: 'browser' | 'codex'
    durationMs: number
    transcript: string | null
    error: string | null
    audio: Uint8Array | null
}): void {
    db.run('BEGIN IMMEDIATE')
    try {
        const failed = !input.transcript
        let audio = failed ? input.audio : null
        let error = failed ? input.error?.slice(0, 1000) || 'Transcription failed.' : null
        if (audio) {
            // Query lengths, never read all saved BLOBs into process memory.
            const usage = db.exec('SELECT COUNT(*), COALESCE(SUM(length(failed_audio)), 0) FROM voice_history WHERE failed_audio IS NOT NULL')[0]?.values[0]
            const count = Number(usage?.[0] || 0)
            const bytes = Number(usage?.[1] || 0)
            if (count >= MAX_FAILED_VOICE_HISTORY_RECORDINGS || audio.byteLength > MAX_FAILED_VOICE_HISTORY_BYTES - bytes) {
                audio = null
                error = `${(error || 'Transcription failed.').slice(0, 800)} ${STORAGE_FULL_MESSAGE}`
            }
        }
        db.run('INSERT INTO voice_history (id, created_at, engine, status, duration_ms, transcript, error, failed_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            input.id, input.createdAt, input.engine, failed ? 'failed' : 'success',
            input.durationMs, input.transcript, error, audio
        ])
        db.run('COMMIT')
    } catch (error) {
        db.run('ROLLBACK')
        throw error
    }
}
