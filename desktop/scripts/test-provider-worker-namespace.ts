import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Worker, WorkerOptions } from 'node:worker_threads'
import { configureDesktopTerminalEnvironment, resolveDesktopAgentServerNamespace } from '../src/main/assistant/agent-server-namespace'
import { createDesktopProviderWorker } from '../src/main/setup/provider-worker-client'

const ambientStateDirectory = process.env.ZYRA_STATE_DIR
const ambientChannel = process.env.ZYRA_AGENT_SERVER_CHANNEL
process.env.ZYRA_STATE_DIR = '/fixture/unrelated-cli-store'
process.env.ZYRA_AGENT_SERVER_CHANNEL = 'default'

try {
    assert.throws(() => createDesktopProviderWorker(() => ({} as Worker)), /namespace is not configured/,
        'an unconfigured Desktop worker must not silently use the CLI credential store')
    for (const profile of ['/fixture/Zyra-dev', '/fixture/zyra']) {
        configureDesktopTerminalEnvironment(profile)
        let workerOptions: WorkerOptions | undefined
        createDesktopProviderWorker((_url, options) => {
            workerOptions = options
            return {} as Worker
        })
        assert.equal(workerOptions?.env?.ZYRA_STATE_DIR, resolveDesktopAgentServerNamespace(profile).stateDirectory,
            'provider sign-in, account reads, Voice, and chat must use the same Desktop credential store')
        assert.equal(workerOptions?.env?.ZYRA_AGENT_SERVER_CHANNEL, 'desktop')
        assert.notEqual(workerOptions?.env?.ZYRA_STATE_DIR, '/fixture/unrelated-cli-store',
            'a pre-existing CLI environment must not override the active Desktop profile')
    }
} finally {
    if (ambientStateDirectory === undefined) delete process.env.ZYRA_STATE_DIR
    else process.env.ZYRA_STATE_DIR = ambientStateDirectory
    if (ambientChannel === undefined) delete process.env.ZYRA_AGENT_SERVER_CHANNEL
    else process.env.ZYRA_AGENT_SERVER_CHANNEL = ambientChannel
}

const runtimeSource = readFileSync(new URL('../src/main/assistant/zyra-runtime.ts', import.meta.url), 'utf8')
assert.match(runtimeSource, /env:\s*\{\s*\.\.\.process\.env,[\s\S]{0,100}\.\.\.desktopTerminalEnvironment\(\)/,
    'private Desktop chat workers also inherit the active credential namespace')

console.log('Provider worker uses the active Desktop credential namespace: ok')
