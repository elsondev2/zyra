import assert from 'node:assert/strict'
import { PluginDownloadController, type PluginDownloadApi } from '../src/renderer/src/pages/plugins/plugin-download-controller'
import { makePluginDirectoryFixture } from './fixtures/plugin-directory-data'
import { getReviewedCatalogPluginSelection } from '../src/renderer/src/pages/plugins/plugin-directory-state'
import type { AssistantPluginInspection } from '../src/shared/assistant/contracts'

const release = makePluginDirectoryFixture().releases[0]
const review = (): AssistantPluginInspection => ({
    reviewId: 'review-fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), manifest: release.manifest,
    release: { name: release.manifest.name, version: release.version, contentDigest: release.contentDigest, fileCount: release.fileCount, totalBytes: release.totalBytes, containsExecutableFiles: true, skills: release.skills, contributions: [{ kind: 'skills', relativePath: './skills', support: 'supported' }, { kind: 'mcp', relativePath: './.mcp.json', support: 'planned' }], diagnostics: [] }
})
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 2))
async function until(predicate: () => boolean) {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await tick() }
    throw Error('Controller condition did not settle')
}
type Reply = Awaited<ReturnType<PluginDownloadApi['getPluginDownload']>>
const controllers: PluginDownloadController[] = []
function make(api: PluginDownloadApi) { const controller = new PluginDownloadController(() => api, 1); controllers.push(controller); return controller }
try {
    const installation = deferred<Awaited<ReturnType<NonNullable<PluginDownloadApi['installInspectedPlugin']>>>>()
    let installCalls = 0
    const automatic = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'automatic', status: 'downloading' } }),
        getPluginDownload: async () => ({ success: true, download: { id: 'automatic', status: 'ready', inspection: review() } }),
        cancelPluginDownload: async () => ({ success: true }),
        installInspectedPlugin: async (input) => { installCalls++; assert.deepEqual(input, { reviewId: 'review-fixture', confirmed: true }); return installation.promise }
    })
    const automaticTask = automatic.start('vercel', { install: true })
    await until(() => installCalls === 1)
    assert.equal(automatic.getSnapshot().phase, 'installing', 'Install activates the inspected package without a second click')
    await automatic.start('vercel', { install: true })
    await automatic.cancel()
    assert.equal(installCalls, 1, 'double clicks and navigation do not create a second activation')
    installation.resolve({ success: true, catalog: makePluginDirectoryFixture() })
    await automaticTask
    assert.equal(automatic.getSnapshot().phase, 'idle')
    assert.equal(automatic.getSnapshot().installationRevision, 1)
    assert.equal(automatic.getSnapshot().installedName, 'vercel', 'completion carries its identity even after the active download is cleared')
    const connectCatalog = makePluginDirectoryFixture()
    const connectPlugin = connectCatalog.plugins[0]
    connectPlugin.sourceId = `openai-catalog:${connectPlugin.name}`
    let connectionCalls = 0
    const connecting = deferred<{ success: true; result: { toolCount: number } }>()
    const automaticConnect = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'connect', status: 'downloading' } }),
        getPluginDownload: async () => ({ success: true, download: { id: 'connect', status: 'ready', inspection: review() } }),
        cancelPluginDownload: async () => ({ success: true }),
        installInspectedPlugin: async () => ({ success: true, catalog: connectCatalog }),
        getPluginMcpConnections: async () => ({ success: true, connections: [{ pluginId: connectPlugin.id, name: 'Fixture', server: 'remote', kind: 'http', destination: 'example.test', state: connectionCalls ? 'connected' : 'not-connected' }] }),
        connectPluginMcp: async () => { connectionCalls++; return connecting.promise }
    })
    const connectTask = automaticConnect.start(connectPlugin.name, { install: true, connect: true })
    await until(() => connectionCalls === 1)
    assert.equal(automaticConnect.getSnapshot().phase, 'connecting', 'explicit Install & connect continues into sign-in without another settings visit')
    assert.equal(automaticConnect.getSnapshot().installationRevision, 1, 'installation succeeds before account sign-in finishes')
    await automaticConnect.start(connectPlugin.name, { install: true, connect: true })
    assert.equal(connectionCalls, 1, 'a second click does not duplicate sign-in')
    connecting.resolve({ success: true, result: { toolCount: 1 } })
    await connectTask
    assert.equal(automaticConnect.getSnapshot().connectionRevision, 1)
    assert.equal(automaticConnect.getSnapshot().phase, 'idle')
    assert.equal(automaticConnect.getSnapshot().connectionError, undefined)
    const declined = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'declined', status: 'downloading' } }),
        getPluginDownload: async () => ({ success: true, download: { id: 'declined', status: 'ready', inspection: review() } }),
        cancelPluginDownload: async () => ({ success: true }),
        installInspectedPlugin: async () => ({ success: true, catalog: connectCatalog }),
        getPluginMcpConnections: async () => ({ success: true, connections: [{ pluginId: connectPlugin.id, name: 'Fixture', server: 'remote', kind: 'http', destination: 'example.test', state: 'not-connected' }] }),
        connectPluginMcp: async () => ({ success: false, error: 'Sign-in declined.' })
    })
    await declined.start(connectPlugin.name, { install: true, connect: true })
    assert.equal(declined.getSnapshot().phase, 'idle', 'a connection failure is not a failed installation to retry blindly')
    assert.equal(declined.getSnapshot().installationRevision, 1)
    assert.match(declined.getSnapshot().connectionError || '', /declined/u)
    let expiredInstalls = 0
    const expiredAutomatic = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'expired-auto', status: 'downloading' } }),
        getPluginDownload: async () => ({ success: true, download: { id: 'expired-auto', status: 'ready', inspection: { ...review(), expiresAt: '2000-01-01T00:00:00Z' } } }),
        cancelPluginDownload: async () => ({ success: true }),
        installInspectedPlugin: async () => { expiredInstalls++; return { success: true, catalog: makePluginDirectoryFixture() } }
    })
    await expiredAutomatic.start('vercel', { install: true })
    assert.equal(expiredInstalls, 0, 'one-click installation cannot approve an expired inspection')
    assert.equal(expiredAutomatic.getSnapshot().phase, 'failed')
    const catalog = makePluginDirectoryFixture()
    const selected = catalog.plugins[0]
    selected.sourceId = `openai-catalog:${selected.name}`
    const sameBytes = { ...selected, id: 'other-installation', sourceId: 'other-source', activeReleaseId: 'other-release' }
    catalog.plugins.unshift(sameBytes)
    catalog.releases.unshift({ ...catalog.releases[0], id: 'other-release', pluginId: sameBytes.id })
    assert.equal(getReviewedCatalogPluginSelection(catalog, selected.name, review())?.pluginId, selected.id, 'new Chat selects the reviewed source, not the first matching digest')
    selected.state = 'disabled'
    assert.equal(getReviewedCatalogPluginSelection(catalog, selected.name, review()), null, 'install cannot silently reactivate a disabled Plugin')
    selected.state = 'active'
    const selectedRelease = catalog.releases.find(entry => entry.id === selected.activeReleaseId)!
    const savedSkills = selectedRelease.skills
    selectedRelease.skills = []
    assert.equal(getReviewedCatalogPluginSelection(catalog, selected.name, review())?.pluginId, selected.id, 'tool-only plugins support Install and new Chat')
    selectedRelease.skills = savedSkills
    assert.equal(getReviewedCatalogPluginSelection(catalog, selected.name, { ...review(), release: { ...review().release, contentDigest: 'e'.repeat(64) } }), null, 'a changed release cannot inherit approval')
    const result = deferred<Reply>()
    let reads = 0, cancellations = 0, notifications = 0
    const controller = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'job', status: 'downloading' } }),
        getPluginDownload: async () => { reads++; return reads === 1 ? { success: true, download: { id: 'job', status: 'downloading', progress: { phase: 'downloading', completedFiles: 1, totalFiles: 2, completedBytes: 10, totalBytes: 20, cacheHits: 1 } } } : result.promise },
        cancelPluginDownload: async () => { cancellations++; return { success: true } }
    })
    const unsubscribe = controller.subscribe(() => notifications++)
    const task = controller.start('vercel')
    await until(() => reads === 2)
    assert.equal(controller.getSnapshot().download?.progress?.completedFiles, 1)
    unsubscribe() // Navigation removes the listener, not the main-owned job.
    const afterUnmount = notifications
    result.resolve({ success: true, download: { id: 'job', status: 'ready', inspection: review() } })
    await task
    assert.equal(notifications, afterUnmount)
    assert.equal(cancellations, 0)
    assert.equal(controller.getSnapshot().phase, 'ready', 'returning to Plugins sees the same review')
    assert.ok(controller.claimReview())
    assert.equal(controller.claimReview(), null, 'double confirmation cannot claim the review twice')
    await controller.cancel()
    assert.equal(cancellations, 0, 'cancellation cannot race activation')
    controller.finishInstall()
    await tick()
    assert.equal(controller.getSnapshot().phase, 'idle')
    assert.equal(controller.getSnapshot().installationRevision, 1, 'remounted clients can refresh their catalog after activation finishes')
    assert.equal(cancellations, 1)

    const lateStart = deferred<Awaited<ReturnType<PluginDownloadApi['startPluginDownload']>>>()
    const released: string[] = []
    const beforeId = make({
        startPluginDownload: () => lateStart.promise,
        getPluginDownload: async () => { throw Error('Cancelled start must not poll') },
        cancelPluginDownload: async ({id}) => { released.push(id); return { success: true } }
    })
    const pending = beforeId.start('vercel')
    const cancelled = beforeId.cancel()
    assert.equal(beforeId.getSnapshot().phase, 'cancelling')
    lateStart.resolve({ success: true, download: { id: 'late-id', status: 'downloading' } })
    await Promise.all([pending, cancelled])
    assert.deepEqual(released, ['late-id'])
    assert.equal(beforeId.getSnapshot().phase, 'idle')

    const latePoll = deferred<Reply>()
    let polled = false
    const duringPoll = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'poll-id', status: 'downloading' } }),
        getPluginDownload: () => { polled = true; return latePoll.promise },
        cancelPluginDownload: async () => ({ success: true })
    })
    const polling = duringPoll.start('vercel')
    await until(() => polled)
    const cancelPolling = duringPoll.cancel()
    latePoll.resolve({ success: true, download: { id: 'poll-id', status: 'ready', inspection: review() } })
    await Promise.all([polling, cancelPolling])
    assert.equal(duringPoll.getSnapshot().phase, 'idle', 'late ready cannot resurrect a cancelled review')

    let starts = 0, fail = true
    const retry = make({
        startPluginDownload: async () => ({ success: true, download: { id: `retry-${++starts}`, status: 'downloading' } }),
        getPluginDownload: async ({id}) => ({ success: true, download: fail ? { id, status: 'failed', error: 'Fixture network failure' } : { id, status: 'ready', inspection: review() } }),
        cancelPluginDownload: async () => ({ success: true })
    })
    await retry.start('vercel')
    assert.equal(retry.getSnapshot().phase, 'failed')
    fail = false
    await retry.start('vercel')
    assert.equal(starts, 2)
    assert.equal(retry.getSnapshot().phase, 'ready')
    retry.claimReview(); retry.finishInstall('Fixture installation failed. Try again.')
    assert.equal(retry.getSnapshot().phase, 'failed')

    let allowCleanup = false, blockedStarts = 0
    const blocked = make({
        startPluginDownload: async () => ({ success: true, download: { id: `blocked-${++blockedStarts}`, status: 'downloading' } }),
        getPluginDownload: async () => ({ success: false, error: 'Fixture failure' }),
        cancelPluginDownload: async () => allowCleanup ? { success: true } : { success: false, error: 'Cleanup unavailable' }
    })
    await blocked.start('vercel')
    await blocked.start('vercel')
    assert.equal(blockedStarts, 1, 'retry cannot create a competing owner job while cleanup failed')
    allowCleanup = true
    await blocked.cancel()
    assert.equal(blocked.getSnapshot().phase, 'idle')

    let installationStarts = 0, releaseAllowed = false
    const failedActivation = make({
        startPluginDownload: async () => ({ success: true, download: { id: `activation-${++installationStarts}`, status: 'downloading' } }),
        getPluginDownload: async ({id}) => ({ success: true, download: { id, status: 'ready', inspection: review() } }),
        cancelPluginDownload: async () => releaseAllowed ? { success: true } : { success: false, error: 'Cleanup unavailable' }
    })
    await failedActivation.start('vercel')
    failedActivation.claimReview(); failedActivation.finishInstall('Installation request failed.')
    await tick()
    await failedActivation.start('vercel')
    assert.equal(installationStarts, 1, 'failed activation keeps cleanup ownership until acknowledged')
    releaseAllowed = true
    await failedActivation.cancel()
    assert.equal(failedActivation.getSnapshot().phase, 'idle')

    const expires = make({
        startPluginDownload: async () => ({ success: true, download: { id: 'expires', status: 'downloading' } }),
        getPluginDownload: async () => ({ success: true, download: { id: 'expires', status: 'ready', inspection: { ...review(), expiresAt: new Date(Date.now() + 20).toISOString() } } }),
        cancelPluginDownload: async () => ({ success: true })
    })
    await expires.start('vercel')
    await until(() => expires.getSnapshot().phase === 'failed')
    assert.equal(expires.claimReview(), null, 'expired review cannot activate')
    console.log('Plugin controller: navigation survival, explicit review, cancellation races, retry, cleanup and expiry: ok')
} finally {
    for (const controller of controllers) {
        if (controller.getSnapshot().phase === 'installing') controller.finishInstall()
        await controller.cancel()
    }
}
