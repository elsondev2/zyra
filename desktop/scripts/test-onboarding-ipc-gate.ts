import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createOnboardingGatedIpcMain } from '../src/main/ipc/onboarding-ipc-gate'

const registered = new Map<string, (...args: unknown[]) => unknown>()
const target = {
    marker: 'bound',
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
        registered.set(channel, handler)
    },
    readMarker() {
        return this.marker
    }
}
let accessAllowed = false
const gated = createOnboardingGatedIpcMain(target, {
    isAccessAllowed: () => accessAllowed,
    allowedBeforeOnboarding: new Set(['setup:allowed']),
    blockedResult: () => ({ success: false, code: 'ONBOARDING_REQUIRED' })
})

gated.handle('setup:allowed', () => 'setup-result')
gated.handle('project:read', (_event, value) => `protected:${value}`)
assert.equal(registered.get('setup:allowed')?.(), 'setup-result')
assert.deepEqual(registered.get('project:read')?.({}, 'private'), {
    success: false,
    code: 'ONBOARDING_REQUIRED'
})
accessAllowed = true
assert.equal(registered.get('project:read')?.({}, 'private'), 'protected:private')
assert.equal(gated.readMarker(), 'bound', 'non-handle Electron methods must retain their receiver')

const registrySource = readFileSync(resolve(import.meta.dirname, '../src/main/ipc/handlers.ts'), 'utf8')
const setupHandlersSource = readFileSync(resolve(import.meta.dirname, '../src/main/ipc/handlers/setup-handlers.ts'), 'utf8')
assert.match(registrySource, /ipcMain as electronIpcMain/)
assert.match(registrySource, /createOnboardingGatedIpcMain\(electronIpcMain/)
assert.match(registrySource, /'devscope:selectFolder',[\s\S]*'window:isMaximized',[\s\S]*'window:getRuntimeInfo'/)
assert.doesNotMatch(
    registrySource.split('PRE_ONBOARDING_ALLOWED_INVOKE_CHANNELS')[1]?.split('])')[0] || '',
    /assistant|projectDetails|readFile|terminal|Git|agent/i,
    'normal Assistant, filesystem, terminal, Git, and control channels must fail closed'
)
assert.match(setupHandlersSource, /ipcMain as electronIpcMain/)
assert.match(setupHandlersSource, /createOnboardingGatedIpcMain\(electronIpcMain/)
const preOnboardingSetupAllowlist = setupHandlersSource
    .split('PRE_ONBOARDING_SETUP_CHANNELS')[1]
    ?.split('])')[0] || ''
for (const required of [
    'DEVICE_PREFERENCES_IPC.get',
    'DEVICE_SECRETS_IPC.migrateLegacyHostedAiKeys',
    'ONBOARDING_IPC.getState',
    'ONBOARDING_IPC.connectChatGpt',
    'ONBOARDING_IPC.connectApiKey',
    'ONBOARDING_IPC.updateAppearance',
    'ONBOARDING_IPC.commitStep'
]) {
    assert.ok(preOnboardingSetupAllowlist.includes(required), `${required} must remain available to mandatory setup`)
}
assert.doesNotMatch(
    preOnboardingSetupAllowlist,
    /DEVICE_PREFERENCES_IPC\.update|DEVICE_SECRETS_IPC\.updateHostedAiKeys|ONBOARDING_IPC\.getConnectionsStatus|ONBOARDING_IPC\.disconnectOpenAI/,
    'pre-onboarding renderers must not mutate normal preferences, replace secrets, inspect the account, or disconnect credentials'
)
assert.match(setupHandlersSource, /input\?\.confirmed !== true/)
assert.match(setupHandlersSource, /CONFIRMATION_REQUIRED/)

console.log('onboarding main-process IPC gate: ok')
