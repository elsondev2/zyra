import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { createAssistantThread } from '../src/main/assistant/service-state'
import { createAssistantSessionRecord } from '../src/main/assistant/service-records'
import { createDefaultSnapshot } from '../src/main/assistant/projector'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { replaceAssistantSnapshot } from '../src/main/assistant/persistence-write'
import { readAssistantPersistenceRecord } from '../src/main/assistant/persistence-read'
import { toAssistantThreadShell } from '../src/main/assistant/persistence-snapshot'

const createdAt = '2026-08-14T12:00:00.000Z'
const thread = createAssistantThread(createdAt, null, 'C:/projects/zyra', {
    webSearch: false,
    webFetch: true
})
assert.equal(thread.webSearch, false)
assert.equal(thread.webFetch, true)
assert.equal(toAssistantThreadShell(thread).webSearch, false)
assert.equal(toAssistantThreadShell(thread).webFetch, true)

const inherited = createAssistantThread(createdAt, thread, undefined)
assert.equal(inherited.webSearch, false, 'a new branch without explicit defaults inherits its thread policy')
assert.equal(inherited.webFetch, true)
const changedDefault = createAssistantThread(createdAt, thread, undefined, { webSearch: true, webFetch: false })
assert.equal(changedDefault.webSearch, true, 'current defaults apply to newly-created chats')
assert.equal(changedDefault.webFetch, false)
assert.equal(thread.webSearch, false, 'changing a default must not rewrite an existing thread')
assert.equal(thread.webFetch, true)

const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
const snapshot = createDefaultSnapshot()
const session = createAssistantSessionRecord({
    sessionId: 'session-web-defaults',
    title: 'Web defaults',
    projectPath: 'C:/projects/zyra',
    createdAt,
    thread
})
snapshot.sessions = [session]
snapshot.selectedSessionId = session.id
replaceAssistantSnapshot(db, snapshot)
const restored = readAssistantPersistenceRecord(db).snapshot.sessions[0]?.threads[0]
assert.equal(restored?.webSearch, false, 'web search policy must survive SQLite persistence')
assert.equal(restored?.webFetch, true, 'web fetch policy must survive SQLite persistence')
db.close()

const here = dirname(fileURLToPath(import.meta.url))
const runtimeSource = readFileSync(resolve(here, '../src/main/assistant/zyra-pi-runtime.ts'), 'utf8')
const serviceSource = readFileSync(resolve(here, '../src/main/assistant/service.ts'), 'utf8')
const mainSource = readFileSync(resolve(here, '../src/main/index.ts'), 'utf8')
const workerSource = readFileSync(resolve(here, '../src/main/assistant/zyra-agent-server-worker.ts'), 'utf8')
const bridgeSource = readFileSync(resolve(here, '../../src/zyra-ui-bridge.mjs'), 'utf8')
const serverSource = readFileSync(resolve(here, '../../src/agent-server/server.mjs'), 'utf8')
const settingsSource = readFileSync(resolve(here, '../src/renderer/src/pages/settings/AssistantSettings.tsx'), 'utf8')

assert.match(serviceSource, /Promise\.resolve\(\{ webSearch: true, webFetch: true \}\)/, 'ordinary new chats must fail open to both web tools when no preference exists')
assert.match(mainSource, /getNewChatExecutionDefaults: \(\) => setupServices\.preferences\.getNewChatWebDefaults\(\)/, 'Desktop must inject main-owned web defaults into new chats')
assert.match(mainSource, /getTitleGenerationModel: \(\) => setupServices\.preferences\.getAssistantTitleModel\(\)/, 'Desktop must inject the main-owned title model into utility title generation')
assert.match(runtimeSource, /webSearch: context\.webSearch/)
assert.match(runtimeSource, /webFetch: context\.webFetch/)
assert.match(workerSource, /webSearch: payload\['webSearch'\]/)
assert.match(workerSource, /webFetch: payload\['webFetch'\]/)
assert.match(bridgeSource, /typeof source\.webSearch === "boolean"/)
assert.match(bridgeSource, /typeof source\.webFetch === "boolean"/)
assert.match(bridgeSource, /webSearch: runtime\?\.webSearch/)
assert.match(bridgeSource, /webFetch: runtime\?\.webFetch/)
assert.match(bridgeSource, /model: "openai-codex\/gpt-5\.6-luna"/, 'standalone Zyra title generation should default to GPT-5.6 Luna')
assert.match(bridgeSource, /async function handleGenerateText[\s\S]{0,320}noSession: true/, 'title utility prompts must remain sessionless and outside canonical chat history')
assert.match(serverSource, /session\.connect\(\{[\s\S]*\.\.\.params/)
assert.match(settingsSource, /assistantDefaultWebSearch/)
assert.match(settingsSource, /assistantDefaultWebFetch/)

console.log('assistant per-thread web defaults: ok')
