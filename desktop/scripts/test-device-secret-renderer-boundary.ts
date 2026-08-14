import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const contract = read('src/shared/contracts/devscope-api.ts')
const preload = read('src/preload/adapters/setup-adapter.ts')
const setupHandlers = read('src/main/ipc/handlers/setup-handlers.ts')
const rendererSettings = read('src/renderer/src/lib/settings.tsx')
const gitProvider = read('src/renderer/src/lib/gitAi.ts')
const mainHandlers = read('src/main/ipc/handlers/settings-ai-handlers.ts')
const aiSettings = read('src/renderer/src/pages/settings/AISettings.tsx')
const secretService = read('src/main/setup/device-secrets-service.ts')

for (const [label, source] of [['DevScope contract', contract], ['preload', preload], ['setup IPC', setupHandlers]] as const) {
    assert.doesNotMatch(source, /getHostedAiKeys/, `${label} must never return decrypted hosted keys to a renderer`)
}
assert.doesNotMatch(contract, /getHostedAiStatus/)
assert.doesNotMatch(preload, /getHostedAiStatus/)
assert.match(rendererSettings, /groqApiKey: '',[\s\S]*geminiApiKey: '',[\s\S]*groqApiKeyConfigured/)
assert.match(rendererSettings, /migrateLegacyHostedAiKeys[\s\S]*migrationResult\?\.success \? migrationResult\.status[\s\S]*clearMigratedLegacySettings/)
assert.match(gitProvider, /Main resolves the OS-encrypted key/)
assert.doesNotMatch(gitProvider, /settings\.groqApiKey\s*\|\||settings\.geminiApiKey\s*\|\|/)
assert.match(mainHandlers, /configureHostedAiSecretResolver/)
assert.match(mainHandlers, /resolveProviderApiKey/)
assert.match(aiSettings, /<ConfirmModal/)
assert.match(aiSettings, /confirmClear: true/)
assert.match(secretService, /CONFIRMATION_REQUIRED/)

console.log('device secret renderer boundary: ok')
