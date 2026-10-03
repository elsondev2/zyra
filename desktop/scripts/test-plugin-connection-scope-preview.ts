import assert from 'node:assert/strict'
import { makePluginDirectoryFixture } from './fixtures/plugin-directory-data'
import { previewChatPluginScopeDiff } from '../src/renderer/src/pages/plugins/plugin-directory-state'
import type { AssistantChatPluginScope } from '../src/shared/assistant/contracts'
const catalog = makePluginDirectoryFixture()
catalog.pluginSets[0].pluginIds = [catalog.plugins[0].id]
const scope = { ownerKind: 'global', ownerId: 'global', plugins: [] } as unknown as AssistantChatPluginScope
scope.plugins = previewChatPluginScopeDiff(catalog, scope).added
assert.equal(previewChatPluginScopeDiff(catalog, scope).changed.length, 0)
const release = catalog.releases[0]
release.appMcpPath = './.app.json'
release.mcpServerPins = [{ name: 'reviewed-extra', descriptorDigest: 'e'.repeat(64) }]
let diff = previewChatPluginScopeDiff(catalog, scope)
assert.equal(diff.changed.length, 1, 'newly reviewed connections require scope review even when release bytes and IDs are unchanged')
assert.equal(diff.changed[0].after.appMcpPath, './.app.json')
assert.deepEqual(diff.changed[0].after.mcpServerPins, release.mcpServerPins)
assert.equal(scope.plugins[0].appMcpPath, undefined, 'preview never mutates old pins')
scope.plugins = previewChatPluginScopeDiff(catalog, { ...scope, plugins: [] }).added
assert.equal(previewChatPluginScopeDiff(catalog, scope).changed.length, 0)
release.mcpServerPins = []
assert.equal(previewChatPluginScopeDiff(catalog, scope).changed.length, 1, 'an empty descriptor ceiling differs from the previous reviewed set')
delete release.appMcpPath
scope.plugins = previewChatPluginScopeDiff(catalog, { ...scope, plugins: [] }).added
delete release.mcpServerPins
assert.equal(previewChatPluginScopeDiff(catalog, scope).changed.length, 1, 'legacy unspecified ceilings are not equivalent to explicit empty ceilings')
console.log('Chat connection preview preserves old pins and detects additional paths and descriptor ceilings at identical package digests.')
