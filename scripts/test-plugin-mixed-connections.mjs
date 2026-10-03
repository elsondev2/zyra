import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ZyraPluginRegistry } from '../src/plugins/plugin-registry.mjs'
import { inspectZyraPluginPackage } from '../src/plugins/plugin-package.mjs'
import {
  capZyraPluginConnectionServers,
  createZyraPluginConnectionPins,
  mergeZyraPluginConnectionSources,
  normalizeZyraPluginConnectionPins,
  parsePinnedZyraPluginConnectionConfig,
} from '../src/plugins/plugin-connection-sources.mjs'

const CLICKUP = 'asdk_app_69431e6d26b88191b4029488aeb42f5b'
const MONDAY = 'connector_690aabb71bf481918b8d5b614ed3fd4c'
const native = { remote: { url: 'https://example.com/mcp' } }
const apps = { clickup: { id: CLICKUP }, monday: { id: MONDAY }, unresolved: { id: 'unmapped_fixture' } }
const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-mixed-connections-'))
try {
  async function packageFixture(name, servers, appEntries) {
    const packageRoot = path.join(root, name)
    await mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true })
    await writeFile(path.join(packageRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name, version: '1.0.0', description: 'Synthetic mixed connection fixture.', ...(servers ? { mcpServers: './.mcp.json' } : {}), ...(appEntries ? { apps: './.app.json' } : {}) }))
    if (servers) await writeFile(path.join(packageRoot, '.mcp.json'), JSON.stringify({ mcpServers: servers }))
    if (appEntries) await writeFile(path.join(packageRoot, '.app.json'), JSON.stringify({ apps: appEntries }))
    return packageRoot
  }
  const packageRoot = await packageFixture('mixed', native, apps)
  await mkdir(path.join(packageRoot, 'skills', 'reviewed'), { recursive: true })
  await writeFile(path.join(packageRoot, 'skills', 'reviewed', 'SKILL.md'), '---\nname: reviewed\ndescription: Synthetic reviewed Skill.\n---\nFixture instructions.\n')
  await writeFile(path.join(packageRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'mixed', version: '1.0.0', description: 'Synthetic mixed connection fixture.', skills: './skills' }))
  const registryPath = path.join(root, 'registry')
  let registry = new ZyraPluginRegistry({ rootPath: registryPath })
  const inspection = await registry.inspectLocalPackage(packageRoot)
  assert.equal(inspection.manifest.contributions.mcp, './.mcp.json')
  assert.equal(inspection.release.appMcpPath, './.app.json')
  assert.deepEqual(inspection.release.mcpServerPins.map(pin => pin.name), ['clickup', 'monday', 'remote'])
  assert(inspection.release.diagnostics.some(entry => entry.type === 'app-mcp-endpoint'))
  assert(inspection.release.diagnostics.some(entry => entry.type === 'unresolved-app-connection'))
  const installed = await registry.installLocalPackage({ packageRoot, approved: true, approvedDigest: inspection.release.contentDigest })
  const source = await registry.getInstalledMcpSource(installed.plugin.id)
  assert.deepEqual(source.servers.map(server => server.name), ['clickup', 'monday', 'remote'])
  await registry.setEnabledPlugins({ pluginIds: [installed.plugin.id], expectedRevision: 1 })
  const original = await registry.createChatScope({ sessionId: 'original' })
  assert.equal(original.plugins[0].appMcpPath, './.app.json')
  assert.deepEqual((await registry.getChatMcpSources('original'))[0].servers, source.servers)
  assert.deepEqual((await registry.ensureAvailableChatScope({ sessionId: 'automatic' })).plugins[0].mcpServerPins, inspection.release.mcpServerPins)

  // Simulate a historical review where today's monday bridge did not exist.
  // Only synthetic temp state is edited: no mapping file or live catalogs.
  const historical = JSON.parse(await readFile(registry.stateFile, 'utf8'))
  const historicalPins = inspection.release.mcpServerPins.filter(pin => pin.name !== 'monday')
  historical.releases[0].mcpServerPins = historicalPins
  for (const scope of historical.chatScopes) {
    scope.plugins[0].mcpServerPins = historicalPins
    scope.plugins[0].skillsPath = './skills/reviewed'
    scope.plugins[0].capabilityCeiling = ['legacy-reviewed-capability']
  }
  await writeFile(registry.stateFile, JSON.stringify(historical))
  registry = new ZyraPluginRegistry({ rootPath: registryPath })
  const oldScope = await registry.getChatScope('original')
  assert.deepEqual((await registry.getInstalledMcpSource(installed.plugin.id)).servers.map(server => server.name), ['clickup', 'remote'], 'new bridge names cannot expand an installed reviewed set')
  assert.deepEqual((await registry.getChatMcpSources('original'))[0].servers.map(server => server.name), ['clickup', 'remote'], 'new bridge names cannot expand pinned Chats')
  assert.deepEqual((await registry.ensureAvailableChatScope({ sessionId: 'before-review' })).plugins[0].mcpServerPins, historicalPins, 'new Chats use installed review metadata, not a freshly inferred bridge set')
  await registry.installLocalPackage({ packageRoot, approved: true, approvedDigest: inspection.release.contentDigest })
  assert.deepEqual((await registry.getInstalledMcpSource(installed.plugin.id)).servers.map(server => server.name), ['clickup', 'monday', 'remote'], 'same-byte explicit review can adopt current normalized capabilities')
  assert.deepEqual(await registry.ensureAvailableChatScope({ sessionId: 'original' }), oldScope, 'automatic discovery cannot rebuild old contribution pins after same-byte review')
  assert.equal((await registry.getChatSkillSources('original'))[0].dir, path.join(installed.release.packagePath, 'skills', 'reviewed'), 'valid prior Skills contribution path remains pinned')
  assert.deepEqual((await registry.getChatMcpSources('original'))[0].servers.map(server => server.name), ['clickup', 'remote'])
  await registry.createChatScope({ sessionId: 'fresh' })
  assert.deepEqual((await registry.getChatMcpSources('fresh'))[0].servers.map(server => server.name), ['clickup', 'monday', 'remote'])
  const reopened = new ZyraPluginRegistry({ rootPath: registryPath })
  assert.deepEqual((await reopened.getChatScope('original')).plugins, oldScope.plugins)
  assert.deepEqual((await reopened.getChatMcpSources('original'))[0].servers.map(server => server.name), ['clickup', 'remote'])

  const identical = await packageFixture('identical', { clickup: { url: 'https://mcp.clickup.com/mcp' } }, { clickup: { id: CLICKUP } })
  assert.equal((await inspectZyraPluginPackage(identical)).release.mcpServerPins.length, 1, 'identical same-name descriptors deduplicate')
  const alias = await packageFixture('native-alias', { clickup: { url: 'https://mcp.clickup.com/mcp', scopes: ['read'], oauth: { client_id: 'reviewed-native-client' } } }, { clickup: { id: CLICKUP } })
  const aliasReview = await inspectZyraPluginPackage(alias)
  assert.equal(aliasReview.release.mcpServerPins.length, 1, 'an opaque same-endpoint reference aliases the reviewed native settings')
  const aliasInstalled = await registry.installLocalPackage({ packageRoot: alias, approved: true, approvedDigest: aliasReview.release.contentDigest })
  assert.deepEqual((await registry.getInstalledMcpSource(aliasInstalled.plugin.id)).servers[0].scopes, ['read'])
  const explicitConflict = await packageFixture('explicit-conflicting', { clickup: { url: 'https://mcp.clickup.com/mcp', scopes: ['read'] } }, { clickup: { id: CLICKUP, scopes: ['write'] } })
  await assert.rejects(inspectZyraPluginPackage(explicitConflict), error => error.code === 'PLUGIN_MCP_CONFIG_INVALID')
  const conflict = await packageFixture('conflicting', { clickup: { url: 'https://example.com/mcp' } }, { clickup: { id: CLICKUP } })
  await assert.rejects(inspectZyraPluginPackage(conflict), error => error.code === 'PLUGIN_MCP_CONFIG_INVALID')
  const many = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`server${index}`, { url: 'https://example.com/mcp' }]))
  const excessive = await packageFixture('excessive', many, { clickup: { id: CLICKUP } })
  await assert.rejects(inspectZyraPluginPackage(excessive), error => error.code === 'PLUGIN_MCP_CONFIG_INVALID')
  const nativeOnly = await packageFixture('native-only', native)
  assert.equal((await inspectZyraPluginPackage(nativeOnly)).release.appMcpPath, undefined)
  const appsOnly = await packageFixture('apps-only', null, { clickup: { id: CLICKUP } })
  const appsInspection = await inspectZyraPluginPackage(appsOnly)
  assert.equal(appsInspection.manifest.contributions.mcp, './.app.json')
  const appsInstalled = await registry.installLocalPackage({ packageRoot: appsOnly, approved: true, approvedDigest: appsInspection.release.contentDigest })
  assert.equal((await registry.getInstalledMcpSource(appsInstalled.plugin.id)).servers[0].name, 'clickup', 'fresh apps-as-MCP still work')

  const parsed = parsePinnedZyraPluginConnectionConfig(JSON.stringify({ apps: { mapped: { id: CLICKUP }, added: { id: 'asdk_app_69a089a326dc8191b32a3f2553f5be2c' }, explicit: { url: 'https://example.com/mcp' } } }), true)
  assert.deepEqual(parsed.map(server => server.name), ['mapped', 'explicit'], 'legacy contributions keep established bridges but never adopt new mappings without review')
  const pins = createZyraPluginConnectionPins(source.servers)
  assert(pins.every(pin => Object.keys(pin).sort().join(',') === 'descriptorDigest,name'), 'review metadata contains names and hashes only')
  const firstDescriptor = { name: 'local', kind: 'stdio', command: 'fixture', args: [], env: { B: 'two', A: 'one' } }
  const reorderedDescriptor = { ...firstDescriptor, env: { A: 'one', B: 'two' } }
  assert.deepEqual(createZyraPluginConnectionPins([firstDescriptor]), createZyraPluginConnectionPins([reorderedDescriptor]), 'descriptor hashing normalizes object key order')
  const changed = source.servers.map(server => server.name === 'clickup' ? { ...server, url: 'https://changed.example/mcp' } : server)
  assert.deepEqual(capZyraPluginConnectionServers(changed, pins).map(server => server.name), ['monday', 'remote'], 'changed endpoint mappings need review')
  assert.deepEqual(capZyraPluginConnectionServers(source.servers.filter(server => server.name !== 'clickup'), pins).map(server => server.name), ['monday', 'remote'], 'absent mappings are not invented')
  assert.deepEqual(mergeZyraPluginConnectionSources(source.servers.slice().reverse()), source.servers, 'merge ordering is deterministic')
  assert.throws(() => normalizeZyraPluginConnectionPins([{ name: 'remote', descriptorDigest: 'invalid' }]))
  assert.throws(() => normalizeZyraPluginConnectionPins([...pins, pins[0]]))
  assert.deepEqual(capZyraPluginConnectionServers(source.servers, []), [], 'an empty reviewed cap stays empty')

  // A byte-identical package outside the registry is not a trusted installed root.
  const installedRelease = registry.state.releases.find(release => release.id === installed.release.id)
  const savedPackagePath = installedRelease.packagePath
  installedRelease.packagePath = packageRoot
  await assert.rejects(registry.getInstalledMcpSource(installed.plugin.id), error => error.code === 'PLUGIN_PATH_ESCAPE')
  installedRelease.packagePath = savedPackagePath
  // Path authority and bytes are validated on every read, including verify:false.
  const pin = registry.state.chatScopes.find(scope => scope.sessionId === 'fresh').plugins[0]
  pin.appMcpPath = '../escape.json'
  await assert.rejects(registry.getChatMcpSources('fresh'), error => error.code === 'PLUGIN_SCOPE_INVALID')
  pin.appMcpPath = './.app.json'
  await writeFile(path.join(installed.release.packagePath, '.mcp.json'), JSON.stringify({ mcpServers: { remote: { url: 'https://tampered.example/mcp' } } }))
  await assert.rejects(registry.getChatMcpSources('fresh', { verify: false }), error => error.code === 'PLUGIN_RELEASE_TAMPERED')
  await writeFile(path.join(installed.release.packagePath, '.mcp.json'), JSON.stringify({ mcpServers: native }))
  await registry.setPluginState(installed.plugin.id, 'disabled')
  await assert.rejects(registry.getInstalledMcpSource(installed.plugin.id), error => error.code === 'PLUGIN_NOT_ACTIVE')
  await assert.rejects(registry.getChatMcpSources('original'), error => error.code === 'PLUGIN_DISABLED')
  await registry.ensureAvailableChatScope({ sessionId: 'original' })
  assert(!((await registry.getChatScope('original')).plugins.some(plugin => plugin.pluginId === installed.plugin.id)), 'disable retains existing automatic scope removal semantics')
  const disabledReload = new ZyraPluginRegistry({ rootPath: registryPath })
  assert(!((await disabledReload.getChatScope('original')).plugins.some(plugin => plugin.pluginId === installed.plugin.id)))
  console.log('Mixed plugin connections: review/install/source/Chat, collision limits, immutable pins, bridge caps, reload, tamper and disable: ok')
} finally {
  await rm(root, { recursive: true, force: true })
}
