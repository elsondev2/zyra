import assert from 'node:assert/strict'
import { ZyraAccountService } from '../src/main/assistant/zyra-account-service'

let statusCalls = 0
let releaseFirstStatus: (() => void) | null = null
const firstStatusGate = new Promise<void>((resolve) => { releaseFirstStatus = resolve })
const service = new ZyraAccountService(async () => ({
    buildChatGptAccountStatus: async () => {
        statusCalls += 1
        if (statusCalls === 1) await firstStatusGate
        return { status: { configured: false }, updatedAt: new Date().toISOString() }
    },
    fetchCodexResetCredits: async () => ({ credits: [] }),
    redeemCodexResetCredit: async () => ({})
}))

const background = service.getOverview()
const forced = service.getOverview(true)
await Promise.resolve()
assert.equal(statusCalls, 1, 'a force refresh waits for the current account request instead of duplicating it')
releaseFirstStatus?.()
await background
const refreshed = await forced
assert.equal(statusCalls, 2, 'force refresh performs a new authoritative account read after the in-flight request')
assert.equal(refreshed.requiresOpenaiAuth, true)

const sharedA = service.getOverview()
const sharedB = service.getOverview()
await Promise.all([sharedA, sharedB])
assert.equal(statusCalls, 3, 'ordinary concurrent account reads still share one request')

console.log('Account service cache contract: ok')
