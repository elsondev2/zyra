import assert from 'node:assert/strict'
import { Database as NativeDatabase } from 'bun:sqlite'
import type { Database } from 'sql.js/dist/sql-asm.js'
import { insertVoiceHistoryEntry, MAX_FAILED_VOICE_HISTORY_BYTES, MAX_FAILED_VOICE_HISTORY_RECORDINGS } from '../src/main/assistant/voice-history-storage'
const native = new NativeDatabase(':memory:')
const db = {
    run(sql: string, params: unknown[] = []) { native.query(sql).run(...params as any[]) },
    exec(sql: string) { return [{values: native.query(sql).values()}] },
    close() { native.close() }
} as unknown as Database
db.run(`CREATE TABLE voice_history (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, engine TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER NOT NULL, transcript TEXT, error TEXT, failed_audio BLOB)`)
const entry = (id: string, audio: Uint8Array | null, transcript: string | null = null) => ({id, createdAt: '2026-01-01T00:00:00Z', engine: 'codex' as const, durationMs: 480_000, transcript, error: 'Network failure', audio})
const usage = () => db.exec('SELECT COUNT(*), COALESCE(SUM(length(failed_audio)), 0) FROM voice_history WHERE failed_audio IS NOT NULL')[0].values[0].map(Number)
const fullWav = new Uint8Array(480 * 24_000 * 2 + 44)
fullWav.set([82, 73, 70, 70])
for (let i = 0; i < 12; i++) insertVoiceHistoryEntry(db, entry(`long-${i}`, fullWav))
assert.deepEqual(usage(), [2, fullWav.byteLength * 2], 'Repeated eight-minute failures must not grow retained audio without a bound')
const retained = db.exec("SELECT failed_audio FROM voice_history WHERE id = 'long-0'")[0].values[0][0] as Uint8Array
assert.deepEqual(retained, fullWav, 'Within-budget failed WAV remains complete and byte-identical')
const overflow = db.exec("SELECT status, failed_audio, error FROM voice_history WHERE id = 'long-11'")[0].values[0]
assert.equal(overflow[0], 'failed')
assert.equal(overflow[1], null)
assert.match(String(overflow[2]), /Network failure.*storage is full.*Delete old recordings/)
assert.equal(db.exec('SELECT COUNT(*) FROM voice_history')[0].values[0][0], 12, 'Failure history is preserved even when audio cannot be retained')
insertVoiceHistoryEntry(db, entry('success', fullWav, 'Recovered transcript'))
assert.equal(db.exec("SELECT failed_audio FROM voice_history WHERE id = 'success'")[0].values[0][0], null)
assert.deepEqual(usage(), [2, fullWav.byteLength * 2], 'Successful outcomes do not use the audio budget')
db.run("DELETE FROM voice_history WHERE id = 'long-0'")
insertVoiceHistoryEntry(db, entry('after-delete', fullWav))
assert.deepEqual(usage(), [2, fullWav.byteLength * 2], 'Explicit deletion frees space for another full recording')
assert.throws(() => insertVoiceHistoryEntry(db, entry('after-delete', fullWav)), /UNIQUE/)
insertVoiceHistoryEntry(db, entry('after-rollback', null))
assert.deepEqual(usage(), [2, fullWav.byteLength * 2], 'Insert failure rolls back and leaves the connection usable')
db.run('DELETE FROM voice_history')
const small = new Uint8Array(44)
for (let i = 0; i < 25; i++) insertVoiceHistoryEntry(db, entry(`small-${i}`, small))
assert.deepEqual(usage(), [MAX_FAILED_VOICE_HISTORY_RECORDINGS, small.byteLength * MAX_FAILED_VOICE_HISTORY_RECORDINGS], 'Count cap also bounds tiny recordings')
db.run('DELETE FROM voice_history')
db.run('INSERT INTO voice_history VALUES (?, ?, ?, ?, ?, ?, ?, zeroblob(?))', ['exact', '2026-01-01', 'codex', 'failed', 0, null, 'Original', MAX_FAILED_VOICE_HISTORY_BYTES])
insertVoiceHistoryEntry(db, entry('past-exact', small))
assert.deepEqual(usage(), [1, MAX_FAILED_VOICE_HISTORY_BYTES], 'Exact-byte boundary blocks additional audio')
db.run('DELETE FROM voice_history')
db.run('INSERT INTO voice_history VALUES (?, ?, ?, ?, ?, ?, ?, zeroblob(?))', ['legacy', '2026-01-01', 'codex', 'failed', 0, null, 'Original', MAX_FAILED_VOICE_HISTORY_BYTES + 1])
insertVoiceHistoryEntry(db, entry('past-legacy', small))
assert.deepEqual(usage(), [1, MAX_FAILED_VOICE_HISTORY_BYTES + 1], 'Over-budget legacy recordings stay untouched while future audio is blocked')
assert.equal(db.exec("SELECT error FROM voice_history WHERE id = 'legacy'")[0].values[0][0], 'Original')
db.close()
console.log('Failed voice history: full eight-minute WAV preservation, byte/count caps, non-destructive legacy handling, space recovery and transaction rollback: passed')
