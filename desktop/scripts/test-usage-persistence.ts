import assert from 'node:assert/strict'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { readAssistantSessionTurnUsage, readAssistantUsageOwners } from '../src/main/assistant/persistence-read'
const SQL=await initSqlJs();const db=new SQL.Database()
db.run('CREATE TABLE assistant_threads (id TEXT, session_id TEXT, provider_thread_id TEXT); CREATE TABLE assistant_turns (id TEXT, thread_id TEXT, model TEXT, state TEXT, requested_at TEXT, started_at TEXT, completed_at TEXT, assistant_message_id TEXT, effort TEXT, service_tier TEXT, usage_json TEXT, updated_at TEXT)')
db.run("INSERT INTO assistant_threads VALUES ('thread-a','session-a','canonical-a'),('thread-b','session-b','canonical-b')")
for (const [id,thread,date] of [['a','thread-a','2026-09-17T00:00:00Z'],['b','thread-b','2026-09-16T00:00:00Z'],['old','thread-b','2025-01-01T00:00:00Z']]) db.run('INSERT INTO assistant_turns (id,thread_id,model,state,requested_at,usage_json,updated_at) VALUES (?,?,?,?,?,?,?)',[id,thread,'custom/model','completed',date,JSON.stringify({inputTokens:12,outputTokens:4}),date])
assert.equal(readAssistantSessionTurnUsage(db,'session-a').length,1,'existing per-chat query unchanged')
const range=readAssistantSessionTurnUsage(db,undefined,'2026-09-10T00:00:00Z')
assert.deepEqual(range.map(row=>row.id),['b','a'],'global query reads all chats and excludes older turns')
assert.equal(range[0].usage?.inputTokens,12)
assert.equal(range[0].canonicalThreadId,'canonical-b','canonical session identity is available for cross-harness deduplication')
assert.ok(readAssistantUsageOwners(db).includes('canonical-a'))
assert.equal(readAssistantUsageOwners(db).length,6)
db.close()
console.log('Usage persistence: actual SQLite range query and existing per-chat query passed.')
