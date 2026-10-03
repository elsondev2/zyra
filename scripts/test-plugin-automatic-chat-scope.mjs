import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ZyraPluginRegistry } from '../src/plugins/plugin-registry.mjs'

const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-auto-plugin-scope-'))
try {
  const registryPath = path.join(root, 'registry')
  let registry = new ZyraPluginRegistry({ rootPath: registryPath })
  await registry.createChatScope({ sessionId: 'existing', projectId: 'project', inherit: false })
  const packageRoot = path.join(root, 'package')
  await mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true })
  async function install(version) {
    await writeFile(path.join(packageRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'fixture', version, description: 'Automatic integration fixture.', mcpServers: './.mcp.json' }))
    await writeFile(path.join(packageRoot, '.mcp.json'), JSON.stringify({ mcpServers: { remote: { url: 'https://example.com/mcp' } } }))
    const inspected = await registry.inspectLocalPackage(packageRoot)
    return registry.installLocalPackage({ packageRoot, approved: true, approvedDigest: inspected.release.contentDigest })
  }
  const installed = await install('1.0.0')
  assert.equal((await registry.getChatScope('existing')).plugins.length, 0)
  const scope = await registry.ensureAvailableChatScope({ sessionId: 'existing', projectId: 'project' })
  assert.equal(scope.plugins[0].pluginId, installed.plugin.id, 'existing project chat discovers installed plugin without enabling a set')
  assert.equal((await registry.getChatMcpSources('existing'))[0].servers[0].name, 'remote')
  const revision = (await registry.getCatalog()).revision
  await registry.ensureAvailableChatScope({ sessionId: 'existing', projectId: 'project' })
  assert.equal((await registry.getCatalog()).revision, revision, 'repeated discovery does not write or notify')
  const updated = await install('2.0.0')
  assert.notEqual(updated.release.id, installed.release.id)
  assert.equal((await registry.ensureAvailableChatScope({ sessionId: 'existing', projectId: 'another-project' })).plugins[0].releaseId, installed.release.id, 'moving projects and discovering tools preserves the approved release pin')
  assert.equal((await registry.ensureAvailableChatScope({ sessionId: 'new' })).plugins[0].releaseId, updated.release.id, 'new chats use the currently installed release')
  await registry.createChatScope({ sessionId: 'playground', inherit: false })
  assert.deepEqual(await registry.getChatMcpSources('playground'), [], 'playground remains isolated without automatic discovery')
  // Simulate a persisted pre-MCP contribution pin on an otherwise valid release.
  const legacyCatalog = JSON.parse(await readFile(registry.stateFile, 'utf8'))
  const legacy = structuredClone(legacyCatalog.chatScopes.find(entry => entry.sessionId === 'existing'))
  legacy.sessionId = 'legacy-null-pin'
  legacy.plugins[0].mcpPath = null
  legacy.plugins[0].capabilityCeiling = ['legacy-reviewed-capability']
  delete legacy.plugins[0].mcpServerPins
  delete legacy.plugins[0].appMcpPath
  legacyCatalog.chatScopes.push(legacy)
  await writeFile(registry.stateFile, JSON.stringify(legacyCatalog))
  registry = new ZyraPluginRegistry({ rootPath: registryPath })
  const legacyBefore = await registry.getChatScope('legacy-null-pin')
  const legacyRevision = (await registry.getCatalog()).revision
  assert.deepEqual(await registry.ensureAvailableChatScope({ sessionId: 'legacy-null-pin', projectId: legacy.ownerId }), legacyBefore, 'automatic discovery retains null MCP and every other contribution pin')
  assert.equal((await registry.getCatalog()).revision, legacyRevision, 'preserving legacy pins is an unchanged fast path')
  assert.deepEqual(await registry.getChatMcpSources('legacy-null-pin'), [], 'legacy null MCP pins never acquire executable authority')
  const legacyReopened = new ZyraPluginRegistry({ rootPath: registryPath })
  assert.deepEqual((await legacyReopened.getChatScope('legacy-null-pin')).plugins, legacyBefore.plugins, 'legacy pins survive normalization and reload')
  await registry.setPluginState(installed.plugin.id, 'disabled')
  assert.deepEqual((await registry.ensureAvailableChatScope({ sessionId: 'existing' })).plugins, [])
  assert.deepEqual(await registry.getChatMcpSources('existing'), [])
  const reopened = new ZyraPluginRegistry({ rootPath: registryPath })
  assert.deepEqual((await reopened.getChatScope('existing')).plugins, [], 'disabled state persists across restarts')
  console.log('Automatic plugin scopes: existing/new chats, MCP discovery, unchanged fast path, release pins, playground isolation and disable/restart: ok')
} finally {
  await rm(root, { recursive: true, force: true })
}
