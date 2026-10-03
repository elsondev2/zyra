import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OpenAIConnectionService } from '../src/main/setup/openai-connection-service'

const refreshes: string[] = []

const service = new OpenAIConnectionService({
    openExternal: () => undefined,
    onCredentialChanged: async (provider) => { refreshes.push(provider) },
    loadSdk: async () => ({
        loginZyraAuth: async () => undefined,
        configureZyraOpenAIApiKey: async () => ({ model: 'openai/gpt-5.6-luna' }),
        verifyZyraOpenAIApiAuth: async () => ({ model: 'openai/gpt-5.6-luna' }),
        getZyraAuthStatus: async () => ({ status: { configured: false } }),
        removeZyraAuth: async () => undefined
    }),
    loadAccount: async () => ({
        buildChatGptAccountStatus: async () => ({ status: { configured: true }, tokenExpiresAt: '2099-01-01T00:00:00.000Z' })
    })
})

assert.equal((await service.connectChatGpt()).verified, true)
assert.deepEqual(refreshes, ['openai-codex'], 'Desktop sign-in triggers a runtime auth refresh')

const setupSource = readFileSync(new URL('../src/main/setup/index.ts', import.meta.url), 'utf8')
assert.match(setupSource, /onCredentialChanged:[\s\S]{0,200}refreshAuthProvider\(provider\)/,
    'the real Desktop setup wires successful sign-ins to active chats')
const runtimeSource = readFileSync(new URL('../src/main/assistant/zyra-runtime.ts', import.meta.url), 'utf8')
assert.match(runtimeSource, /async refreshAuthProvider\(provider: string\)[\s\S]{0,700}request\('auth\.refresh', \{ provider \}\)/,
    'the active chat worker forwards the refresh to its live provider runtime')

console.log('Desktop sign-in refreshes attached chat credentials: ok')
