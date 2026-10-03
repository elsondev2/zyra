import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ZyraPluginRegistry } from '../src/plugins/plugin-registry.mjs'

const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-mcp-only-'))
try {
  const packageRoot = path.join(root, 'package')
  await mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true })
  await writeFile(path.join(packageRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'mcp-only', version: '1.0.0', description: 'MCP-only fixture.', mcpServers: './.mcp.json',
  }))
  await writeFile(path.join(packageRoot, '.mcp.json'), JSON.stringify({
    mcpServers: { remote: { url: 'https://example.com/mcp' } },
  }))
  const registry = new ZyraPluginRegistry({ rootPath: path.join(root, 'registry') })
  const inspection = await registry.inspectLocalPackage(packageRoot)
  assert.equal(inspection.release.skills.length, 0)
  const installed = await registry.installLocalPackage({
    packageRoot, sourceId: 'fixture', approved: true, approvedDigest: inspection.release.contentDigest,
  })
  await registry.setEnabledPlugins({ pluginIds: [installed.plugin.id], expectedRevision: 1 })
  const newScope = await registry.createChatScope({ sessionId: 'new-chat' })
  assert.equal(newScope.plugins[0]?.mcpPath, './.mcp.json')
  assert.equal((await registry.getChatMcpSources('new-chat'))[0]?.servers[0]?.name, 'remote')
  assert.deepEqual(await registry.getChatSkillSources('new-chat'), [])
  await registry.createChatScope({ sessionId: 'old-chat' })
  const state = await registry.getCatalog()
  state.chatScopes.find((entry) => entry.sessionId === 'old-chat').plugins[0].mcpPath = null
  await writeFile(path.join(root, 'registry', 'plugin-state.json'), JSON.stringify(state))
  const reopened = new ZyraPluginRegistry({ rootPath: path.join(root, 'registry') })
  assert.deepEqual(await reopened.getChatMcpSources('old-chat'), [], 'old scope never gains MCP tools silently')
  const refreshed = await reopened.refreshChatScope({ sessionId: 'old-chat' })
  assert.equal(refreshed.diff.changed.length, 1, 'MCP adoption is visible in the refresh review')
  assert.equal(refreshed.scope.plugins[0]?.mcpPath, './.mcp.json')
  for (const [name, id, destination] of [
    ['clickup', 'asdk_app_69431e6d26b88191b4029488aeb42f5b', 'https://mcp.clickup.com/mcp'],
    ['monday-com', 'connector_690aabb71bf481918b8d5b614ed3fd4c', 'https://mcp.monday.com/mcp'],
    ['airtable', 'asdk_app_693ca6ce2db08191bb52d66743c65184', 'https://mcp.airtable.com/mcp'],
    ['custom-app', null, 'https://example.com/custom-mcp'],
  ]) {
    const appRoot = path.join(root, name)
    await mkdir(path.join(appRoot, '.codex-plugin'), { recursive: true })
    await writeFile(path.join(appRoot, '.codex-plugin/plugin.json'), JSON.stringify({
      name, version: '1.0.0', description: 'Registered connection fixture.', apps: './.app.json',
    }))
    await writeFile(path.join(appRoot, '.app.json'), JSON.stringify({ apps: { [name]: id ? { id } : { url: destination } } }))
    const inspected = await reopened.inspectLocalPackage(appRoot)
    assert.equal(inspected.manifest.contributions.mcp, './.app.json', 'app-only packages expose their resolved MCP source')
    const added = await reopened.installLocalPackage({ packageRoot: appRoot, approved: true, approvedDigest: inspected.release.contentDigest })
    const appScope = await reopened.createChatScope({ sessionId: name, selection: {
      pluginId: added.plugin.id, releaseId: added.release.id, contentDigest: inspected.release.contentDigest,
    } })
    assert.equal(appScope.plugins[0]?.mcpPath, './.app.json')
    assert.equal((await reopened.getInstalledMcpSource(added.plugin.id))?.servers[0]?.url, destination)
    assert.equal((await reopened.getChatMcpSources(name))[0]?.servers[0]?.url, destination)
    assert.deepEqual(await reopened.getChatSkillSources(name), [])
  }
  const legacyState = await reopened.getCatalog()
  const clickupRelease = legacyState.releases.find(entry => entry.manifest.name === 'clickup')
  clickupRelease.manifest.contributions.mcp = null
  legacyState.chatScopes.find(entry => entry.sessionId === 'clickup').plugins[0].mcpPath = null
  await writeFile(path.join(root, 'registry', 'plugin-state.json'), JSON.stringify(legacyState))
  const adopted = new ZyraPluginRegistry({ rootPath: path.join(root, 'registry') })
  assert.deepEqual(await adopted.getChatMcpSources('clickup'), [], 'previously inert apps stay inert in old Chats')
  await adopted.installLocalPackage({ packageRoot: path.join(root, 'clickup'), approved: true, approvedDigest: clickupRelease.contentDigest })
  assert.equal((await adopted.getInstalledMcpSource(clickupRelease.pluginId))?.servers[0]?.name, 'clickup', 'explicit reapproval adopts supported metadata even for the same package digest')
  assert.deepEqual(await adopted.getChatMcpSources('clickup'), [], 'reinstalling does not expand existing Chat authority')
  const afterRestart = new ZyraPluginRegistry({ rootPath: path.join(root, 'registry') })
  assert.equal((await afterRestart.getInstalledMcpSource(clickupRelease.pluginId))?.servers[0]?.name, 'clickup', 'resolved connections survive restart')
} finally { await rm(root, { recursive: true, force: true }) }
console.log('MCP-only Plugin availability and per-Chat pinning passed.')
