import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import { ProviderWorkerClient } from '../src/main/setup/provider-worker-client'
import { resolveSettingsSearchLocation, createSettingsRowTargetId } from '../src/renderer/src/pages/settings/settings-search'

let preferences = { version: 1, preset: 'balanced', notes: '' }
const operations: string[] = []
class WorkerFixture extends EventEmitter {
    unref() {}
    async terminate() { return 0 }
    postMessage(message: { id: number; operation: string; input?: Partial<typeof preferences> }) {
        operations.push(message.operation)
        if (message.operation === 'saveDelegationPreferences') preferences = { ...preferences, ...message.input }
        else assert.equal(message.operation, 'readDelegationPreferences')
        queueMicrotask(() => this.emit('message', { type: 'result', id: message.id, result: { preferences, presets: [{ id: 'balanced', label: 'Balanced', description: 'Match the task.' }] } }))
    }
}
const client = new ProviderWorkerClient(() => new WorkerFixture() as unknown as Worker)
try {
    assert.equal((await client.providers.delegationPreferences()).preferences.preset, 'balanced')
    assert.equal((await client.providers.saveDelegationPreferences({ notes: 'Use careful security reviews.' })).preferences.notes, 'Use careful security reviews.')
    assert.deepEqual(operations, ['readDelegationPreferences', 'saveDelegationPreferences'])
} finally { await client.dispose() }
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const ui = source('renderer/src/pages/settings/DelegationPreferences.tsx')
assert.match(ui, /getDelegationPreferences\(\)/)
assert.match(ui, /saveDelegationPreferences\(patch\)/)
assert.match(ui, /save\(\{ preset \}\)/)
assert.match(ui, /save\(\{ notes: draft \}\)/)
assert.doesNotMatch(ui, /getAgentRoleModels|setAgentRoleModel|listModels/)
assert.match(ui, /maxLength=\{4000\}/)
assert.match(source('renderer/src/pages/settings/providers/ProviderModelsPage.tsx'), /<DelegationPreferences \/>/)
assert.doesNotMatch(source('renderer/src/pages/settings/providers/ProviderModelsPage.tsx'), /AgentRoleModels/)
assert.match(source('preload/adapters/setup-adapter.ts'), /getDelegationPreferences: \(\) => ipcRenderer\.invoke\(ONBOARDING_IPC\.getDelegationPreferences\)/)
assert.match(source('main/ipc/handlers/setup-handlers.ts'), /ONBOARDING_IPC\.saveDelegationPreferences[\s\S]{0,160}providers\.saveDelegationPreferences\(input\)/)
for (const role of ['Planning', 'Implementation', 'Review', 'Debugging', 'Verification', 'Research', 'Other agents']) assert.equal(resolveSettingsSearchLocation('provider-models', createSettingsRowTargetId('Delegated work', role))?.targetId, createSettingsRowTargetId('Delegated work', 'Approach'))
for (const file of ['renderer/src/pages/settings/DelegationPreferences.tsx', 'shared/onboarding/contracts.ts', 'preload/adapters/setup-adapter.ts']) new Bun.Transpiler({ loader: file.endsWith('.tsx') ? 'tsx' : 'ts' }).transformSync(source(file))
console.log('Delegation Settings: worker transport, partial-save wiring, no eager model catalog, bounded editable guidance and legacy search redirects: ok')
