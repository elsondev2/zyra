import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type { Worker } from 'node:worker_threads'
import { OpenAIAuthWorkerClient } from '../src/main/setup/openai-auth-worker-client'
import { ZyraAccountService } from '../src/main/assistant/zyra-account-service'

const credit = { id: 'fixture-credit', title: 'Fixture reset', status: 'available', expiresAt: '2099-01-01T00:00:00.000Z' }
let consumed = false, created = 0
const operations: string[] = []
class WorkerFixture extends EventEmitter {
    unref() {}
    async terminate() { return 0 }
    postMessage(message: { id: number; operation: string }) {
        operations.push(message.operation)
        let result: unknown
        if (message.operation === 'buildChatGptAccountStatus') result = { provider: 'openai-codex', status: { configured: true }, usage: { primary: { usedPercent: 25 } } }
        else if (message.operation === 'fetchCodexResetCredits') result = { credits: [{ ...credit, status: consumed ? 'redeemed' : 'available' }] }
        else throw Error('Only account reads belong in this worker test')
        queueMicrotask(() => this.emit('message', { type: 'result', id: message.id, result }))
    }
}
const client = new OpenAIAuthWorkerClient(() => { created++; return new WorkerFixture() as unknown as Worker })
const service = new ZyraAccountService(async () => ({
    ...client.account,
    redeemCodexResetCredit: async (creditId: string) => {
        assert.equal(creditId, credit.id); consumed = true; operations.push('consume-on-main')
        return { code: 'reset', windowsReset: 1 }
    }
}))
try {
    const overview = await service.getOverview()
    assert.equal(overview.requiresOpenaiAuth, false)
    assert.equal(overview.availableResetCount, 1)
    assert.equal(overview.rateLimits?.primary?.usedPercent, 25)
    assert.deepEqual(operations, ['buildChatGptAccountStatus', 'fetchCodexResetCredits'])
    await assert.rejects(() => service.redeemAccountReset({ creditId: credit.id, confirmed: false }), /Confirm/)
    assert.equal(consumed, false)
    operations.length = 0
    const result = await service.redeemAccountReset({ creditId: credit.id, confirmed: true })
    assert.deepEqual(operations, ['fetchCodexResetCredits', 'consume-on-main', 'buildChatGptAccountStatus', 'fetchCodexResetCredits'], 'fresh availability, original mutation owner, then refreshed account data')
    assert.equal(result.redemption.windowsReset, 1)
    assert.equal(result.overview?.availableResetCount, 0)
    assert.equal(result.refreshError, null)
    operations.length = 0
    await assert.rejects(() => service.redeemAccountReset({ creditId: credit.id, confirmed: true }), /no longer available/)
    assert.deepEqual(operations, ['fetchCodexResetCredits'], 'a used credit cannot be consumed again')
    assert.equal(created, 1, 'overview and reset reads reuse the same auth worker')
} finally { await client.dispose() }
// Selected modal reads and approved consumption must carry the exact pool id,
// even while a primary overview is still in flight.
const selectedId = 'fixture-selected-account'
const selectedMessages: Array<{ operation: string; accountId: unknown }> = []
let releasePrimary: (() => void) | undefined
let selectedConsumed = false
class SelectedWorkerFixture extends EventEmitter {
    unref() {}
    async terminate() { return 0 }
    postMessage(message: { id: number; operation: string; options?: { accountId?: string } }) {
        const accountId = message.options?.accountId
        selectedMessages.push({ operation: message.operation, accountId })
        const respond = () => this.emit('message', { type: 'result', id: message.id, result: message.operation === 'buildChatGptAccountStatus'
            ? { provider: 'openai-codex', poolAccountId: accountId, accountId: accountId || 'primary', status: { configured: true }, usage: { primary: { usedPercent: accountId ? 75 : 25 } } }
            : { poolAccountId: accountId, credits: [{ ...credit, status: selectedConsumed && accountId === selectedId ? 'redeemed' : 'available' }] } })
        if (message.operation === 'buildChatGptAccountStatus' && accountId === undefined && !releasePrimary) releasePrimary = respond
        else queueMicrotask(respond)
    }
}
const selectedClient = new OpenAIAuthWorkerClient(() => new SelectedWorkerFixture() as unknown as Worker)
const selectedService = new ZyraAccountService(async () => ({
    ...selectedClient.account,
    redeemCodexResetCredit: async (creditId: string, options?: { accountId?: string }) => {
        assert.equal(creditId, credit.id)
        assert.equal(options?.accountId, selectedId)
        selectedMessages.push({ operation: 'consume-on-main', accountId: options?.accountId })
        selectedConsumed = true
        return { windowsReset: 1 }
    }
}))
try {
    const primary = selectedService.getOverview()
    await Promise.resolve(); await Promise.resolve()
    assert.ok(releasePrimary, 'primary read is deliberately held in flight')
    const selected = await selectedService.getOverview(false, selectedId)
    assert.equal(selected.accountId, selectedId)
    assert.equal(selected.rateLimits?.primary?.usedPercent, 75)
    assert.deepEqual(selectedMessages.slice(1), [
        { operation: 'buildChatGptAccountStatus', accountId: selectedId },
        { operation: 'fetchCodexResetCredits', accountId: selectedId }
    ], 'selected reads bypass the primary overview promise')
    selectedMessages.length = 0
    await assert.rejects(() => selectedService.redeemAccountReset({ creditId: credit.id, confirmed: false, accountId: selectedId }), /Confirm/)
    assert.deepEqual(selectedMessages, [])
    const result = await selectedService.redeemAccountReset({ creditId: credit.id, confirmed: true, accountId: selectedId })
    assert.equal(result.overview?.accountId, selectedId)
    assert.equal(result.overview?.availableResetCount, 0)
    assert.deepEqual(selectedMessages, [
        { operation: 'fetchCodexResetCredits', accountId: selectedId },
        { operation: 'consume-on-main', accountId: selectedId },
        { operation: 'buildChatGptAccountStatus', accountId: selectedId },
        { operation: 'fetchCodexResetCredits', accountId: selectedId }
    ], 'fresh inventory, main-owned mutation and refreshed data all use the selected account')
    releasePrimary!()
    assert.equal((await primary).accountId, 'primary')
    selectedMessages.length = 0
    for (const accountId of ['', '  ', ' fixture-selected-account', 'bad\naccount', null, 42]) {
        await assert.rejects(() => selectedService.getOverview(false, accountId as string), /account.*invalid/i)
        await assert.rejects(() => selectedService.redeemAccountReset({ creditId: credit.id, confirmed: true, accountId: accountId as string }), /account.*invalid/i)
    }
    assert.deepEqual(selectedMessages, [], 'invalid ids cannot issue primary reads or mutations')
} finally { await selectedClient.dispose() }
let staleWorkerInventoryReads = 0
const staleWorkerService = new ZyraAccountService(async () => ({
    buildChatGptAccountStatus: async () => ({ status: { configured: true }, accountId: 'primary' }),
    fetchCodexResetCredits: async () => { staleWorkerInventoryReads++; return { credits: [credit] } },
    redeemCodexResetCredit: async () => { throw new Error('Unexpected mutation') }
}))
await assert.rejects(() => staleWorkerService.getOverview(false, selectedId), /selected ChatGPT account could not be verified/)
assert.equal(staleWorkerInventoryReads, 0, 'an old worker ignoring the target cannot return primary reset inventory as selected')
for (const inventoryPoolAccountId of [undefined, 'primary']) {
    let staleInventoryPosts = 0
    const staleInventoryService = new ZyraAccountService(async () => ({
        buildChatGptAccountStatus: async () => ({ status: { configured: true }, poolAccountId: selectedId }),
        fetchCodexResetCredits: async () => ({ poolAccountId: inventoryPoolAccountId, credits: [credit] }),
        redeemCodexResetCredit: async () => { staleInventoryPosts++; return { windowsReset: 1 } }
    }))
    await assert.rejects(() => staleInventoryService.getOverview(false, selectedId), /selected ChatGPT account.*reset inventory could not be verified/i)
    await assert.rejects(() => staleInventoryService.redeemAccountReset({ creditId: credit.id, confirmed: true, accountId: selectedId }), /selected ChatGPT account.*reset inventory could not be verified/i)
    assert.equal(staleInventoryPosts, 0, 'missing or mismatched reset inventory proof prevents consumption even when status honors the target')
}
const serviceSource = readFileSync(new URL('../src/main/assistant/zyra-account-service.ts', import.meta.url), 'utf8')
const loaderSource = serviceSource.split('async function loadChatGptAccountModule()')[1]!.split('export class ZyraAccountService')[0]!
assert.match(loaderSource, /const \{ account \} = getSharedProviderWorkerClient\(\)/)
assert.match(loaderSource, /buildChatGptAccountStatus: account\.buildChatGptAccountStatus/)
assert.match(loaderSource, /fetchCodexResetCredits: account\.fetchCodexResetCredits/)
assert.match(loaderSource, /redeemCodexResetCredit: redeemResetOnMain/, 'mutation remains on its existing main-owned path')
assert.match(serviceSource, /redeemCodexResetCredit\(creditId, \{ stateDirectory, accountId: options\?\.accountId \}\)/, 'native mutation receives both desktop namespace and selected account')
assert.doesNotMatch(loaderSource, /import\(|chatgpt-account\.mjs/, 'merely opening Account cannot import the model/auth runtime in main')
const workerSource = readFileSync(new URL('../../src/desktop-provider-worker.mjs', import.meta.url), 'utf8')
assert.match(workerSource, /case "fetchCodexResetCredits":\s*return fetchCodexResetCredits\(message\.options\)/)
assert.doesNotMatch(workerSource, /redeemCodexResetCredit/, 'a worker exit cannot lose the result of a reset POST')
console.log('Account worker transport: shared read worker, unchanged mutation owner, confirmation/fresh availability and single consumption: ok')
