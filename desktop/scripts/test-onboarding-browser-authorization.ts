import assert from 'node:assert/strict'
import { BrowserAssistantBridge } from '../src/main/assistant/browser-assistant-bridge'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH,
    BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH,
    BROWSER_FILE_BRIDGE_PATH,
    isBrowserDevscopeBridgePath
} from '../src/shared/browser-assistant-bridge'

const origin = 'http://127.0.0.1:47821'
const capability = 'onboarding-browser-authorization-test'
const relayed: Array<{ path: string[]; args: unknown[] }> = []
let assistantServiceRequested = 0
let onboardingComplete = false
const bridge = new BrowserAssistantBridge({
    getService: () => {
        assistantServiceRequested += 1
        return null
    },
    isOnboardingComplete: () => onboardingComplete,
    allowedOrigins: new Set([origin]),
    capability,
    port: 0,
    invokeDevscope: async (path, args) => {
        relayed.push({ path, args })
        return { success: true, path }
    },
    subscribeDevscopeEvents: () => () => undefined,
    persistClipboardImage: async () => 'never.png',
    resolveClipboardAttachment: async () => null,
    getVoiceTranscriptionState: async () => ({ provider: 'codex', status: 'signed-out', available: false, signedIn: false, message: null }),
    transcribeVoice: async () => 'never'
})

const address = await bridge.start()
const base = `http://127.0.0.1:${address.port}`
const headers = {
    Origin: origin,
    'Content-Type': 'application/json',
    [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    [BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER]: capability
}

try {
    const assistant = await fetch(`${base}${BROWSER_ASSISTANT_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method: 'bootstrap', args: [] })
    })
    assert.equal(assistant.status, 423)
    assert.equal((await assistant.json() as any).code, 'ONBOARDING_REQUIRED')

    const events = await fetch(`${base}${BROWSER_ASSISTANT_BRIDGE_EVENTS_PATH}`, { headers })
    assert.equal(events.status, 423, 'Assistant event hydration must be blocked before setup')

    const file = await fetch(`${base}${BROWSER_FILE_BRIDGE_PATH}?source=zyra%3A%2F%2F%2Fprivate.txt`, { headers })
    assert.equal(file.status, 423, 'protected file content must not bypass browser setup')

    for (const path of [['onboarding', 'getState'], ['preferences', 'get']] as string[][]) {
        const response = await fetch(`${base}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ path, args: [{ surface: 'desktop', legacySettings: { assistantDefaultWebSearch: false } }] })
        })
        assert.equal(response.status, 200, `${path.join('.')} must remain available to the blocked setup surface`)
        assert.equal((await response.json() as any).ok, true)
    }
    for (const path of [['preferences', 'update'], ['selectFolder'], ['getFileSystemRoots']] as string[][]) {
        const response = await fetch(`${base}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ path, args: [] })
        })
        assert.equal(response.status, 423, `${path.join('.')} must be blocked before setup`)
        assert.equal((await response.json() as any).code, 'ONBOARDING_REQUIRED')
    }
    assert.deepEqual(relayed[0]?.path, ['onboarding', 'getState'])
    assert.deepEqual(relayed[1], {
        path: ['preferences', 'get'],
        args: [{ surface: 'browser', legacySettings: undefined }]
    }, 'browser callers cannot spoof the Desktop preference surface or trigger its migration')

    onboardingComplete = true
    const preferenceUpdate = await fetch(`${base}${BROWSER_DEVSCOPE_BRIDGE_INVOKE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            path: ['preferences', 'update'],
            args: [{ surface: 'desktop', expectedRevision: 4, patch: { browserViewMode: 'grid' } }]
        })
    })
    assert.equal(preferenceUpdate.status, 200)
    assert.deepEqual(relayed.at(-1), {
        path: ['preferences', 'update'],
        args: [{ surface: 'browser', expectedRevision: 4, patch: { browserViewMode: 'grid' }, legacySettings: undefined }]
    })
    assert.equal(isBrowserDevscopeBridgePath(['onboarding', 'connectApiKey']), false, 'browser clients cannot complete Desktop onboarding')
    assert.equal(isBrowserDevscopeBridgePath(['onboarding', 'updateAppearance']), false, 'browser clients cannot mutate Desktop onboarding appearance')
    assert.equal(isBrowserDevscopeBridgePath(['secrets', 'getHostedAiStatus']), false, 'browser clients must never relay OS-owned secret metadata')
    assert.equal(isBrowserDevscopeBridgePath(['assistant', 'sendPrompt']), false)
    assert.ok(assistantServiceRequested <= 1, 'starting the blocked bridge must not hydrate Assistant')

    console.log('onboarding browser authorization: ok')
} finally {
    await bridge.stop()
}
