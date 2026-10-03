import assert from 'node:assert/strict'
import { connectReviewedPlugin } from '../src/renderer/src/pages/plugins/plugin-install-connect'
import { makePluginDirectoryFixture } from './fixtures/plugin-directory-data'
import type { AssistantPluginInspection } from '../src/shared/assistant/contracts'
const catalog = makePluginDirectoryFixture()
const plugin = catalog.plugins[0]
plugin.sourceId = `openai-catalog:${plugin.name}`
const release = catalog.releases[0]
const review: AssistantPluginInspection = { reviewId: 'review', expiresAt: new Date(Date.now() + 60000).toISOString(), manifest: release.manifest,
    release: { name: plugin.name, version: release.version, contentDigest: release.contentDigest, fileCount: 1, totalBytes: 100, containsExecutableFiles: false, skills: release.skills, contributions: [], diagnostics: [] } }
const calls: string[] = []
let connected = false
const entry = { pluginId: plugin.id, name: 'Fixture', server: 'remote', kind: 'http' as const, destination: 'example.test', state: 'not-connected' as const }
const api = {
    getPluginMcpConnections: async () => ({ success: true as const, connections: [{ ...entry, state: connected ? 'connected' as const : 'not-connected' as const }] }),
    connectPluginMcp: async (id: string, server: string) => { assert.equal(id, plugin.id); calls.push(server); connected = true; return { success: true as const, result: { toolCount: 1 } } }
}
assert.equal(await connectReviewedPlugin(api, catalog, plugin.name, review, server => calls.push(`working:${server}`)), plugin.id)
assert.deepEqual(calls, ['working:remote', 'remote'])
await connectReviewedPlugin(api, catalog, plugin.name, review)
assert.equal(calls.length, 2, 'an already connected service is not signed in again')
plugin.state = 'disabled'
await assert.rejects(() => connectReviewedPlugin(api, catalog, plugin.name, review), /reviewed release/u)
plugin.state = 'active'
await assert.rejects(() => connectReviewedPlugin(api, catalog, plugin.name, { ...review, release: { ...review.release, contentDigest: 'e'.repeat(64) } }), /reviewed release/u)
await assert.rejects(() => connectReviewedPlugin({ ...api, getPluginMcpConnections: async () => ({ success: true, connections: [{ ...entry, pluginId: 'unrelated-plugin' }] }) }, catalog, plugin.name, review), /identity/u)
await assert.rejects(() => connectReviewedPlugin({ ...api, getPluginMcpConnections: async () => ({ success: true, connections: [] }) }, catalog, plugin.name, review), /no supported servers/u)
connected = false
await assert.rejects(() => connectReviewedPlugin({ ...api, connectPluginMcp: async () => ({ success: false, error: 'Sign-in was declined.' }) }, catalog, plugin.name, review), /declined/u)
assert.equal(plugin.state, 'active', 'connection failure does not undo installation')
await assert.rejects(() => connectReviewedPlugin({ ...api, connectPluginMcp: async () => ({ success: true, result: { toolCount: 0 } }) }, catalog, plugin.name, review), /no tools/u)
release.manifest.contributions.mcp = null
assert.equal(await connectReviewedPlugin({}, catalog, plugin.name, review), plugin.id, 'skills-only plugins need no connection or account API')
console.log('Reviewed install-to-connect identity, sequential sign-in, existing connections and partial installation success passed.')
