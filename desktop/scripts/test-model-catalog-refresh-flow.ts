import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { applyAssistantDomainEvents, createDefaultAssistantSnapshot } from '../src/shared/assistant/projector'
import { isAssistantModelCatalogRefreshDue } from '../src/main/assistant/model-catalog-refresh-policy'

// Run the real service method without booting Electron, a provider worker or SQLite.
const source = readFileSync(new URL('../src/main/assistant/service.ts', import.meta.url), 'utf8')
const method = source.split('async listModels(forceRefresh = false) {')[1]!.split('/** Utility generation')[0]!
const javascript = ts.transpileModule(`async function listModels(forceRefresh = false) {${method}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const listModels = new Function('isAssistantModelCatalogRefreshDue', 'areAssistantModelListsEqual', 'nowIso', `${javascript}; return listModels`)(isAssistantModelCatalogRefreshDue, (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b), () => new Date().toISOString())
const snapshot = createDefaultAssistantSnapshot()
snapshot.knownModels = [{ id: 'openai-codex/old', label: 'Old' }]
let requests = 0
let resolve!: (value: unknown) => void
const published: unknown[] = []
const service: any = {
    state: { snapshot }, modelCatalogLastAttemptAt: 0, modelCatalogLastRefreshFailed: false,
    modelCatalogRefreshPromise: null, disposeRequested: false, ensureReady: async () => {},
    runtime: { listModelsWithProvenance: async () => { requests++; return new Promise(done => { resolve = done }) } },
    appendEvent(type: any, occurredAt: string, payload: any) {
        const event = { sequence: this.state.snapshot.snapshotSequence + 1, eventId: 'catalog-event', type, occurredAt, payload }
        published.push(event)
        this.state.snapshot = applyAssistantDomainEvents(this.state.snapshot, [event])
    }
}
const first = listModels.call(service, false)
await Promise.resolve()
const manual = listModels.call(service, true)
await Promise.resolve()
assert.equal(requests, 1, 'manual and background requests share one refresh')
resolve({ models: [{ id: 'openai-codex/new', label: 'New' }], authoritative: true })
await Promise.all([first, manual])
assert.equal(published.length, 1)
assert.deepEqual(service.state.snapshot.knownModels.map((m: any) => m.id), ['openai-codex/new'], 'event projection replaces the client catalog')
const failed = listModels.call(service, true)
await Promise.resolve()
resolve({ models: [], authoritative: false, error: 'HTTP 503' })
assert.equal((await failed).success, false)
assert.deepEqual(service.state.snapshot.knownModels.map((m: any) => m.id), ['openai-codex/new'])
assert.equal(service.modelCatalogLastRefreshFailed, true)
assert.match(source, /modelCatalogTimer = setInterval/)
assert.match(source, /clearInterval\(this.modelCatalogTimer\)/)
const empty = listModels.call(service, true)
await Promise.resolve()
resolve({ models: [], authoritative: true })
await empty
assert.deepEqual(service.state.snapshot.knownModels, [], 'successful empty discovery removes the final unavailable model')
service.modelCatalogLastAttemptAt = 0
const backgroundFailure = listModels.call(service, false)
await Promise.resolve()
const joinedManual = listModels.call(service, true)
await Promise.resolve()
resolve({ models: [], authoritative: false, error: 'HTTP 429' })
assert.equal((await backgroundFailure).success, true, 'background failure retains the last good list')
assert.equal((await joinedManual).error, 'HTTP 429', 'manual refresh sees failures even when it joins background work')
console.log('Model catalog refresh flow: deduplication, broadcasts, removal and failure preservation: ok')
