import assert from 'node:assert/strict'
import path from 'node:path'
import { createServer } from 'node:http'
import { ZyraPluginMcpPool } from '../src/plugins/plugin-mcp-pool.mjs'

const source = {
  pluginId: 'plugin-test', releaseId: 'release-1', contentDigest: 'a'.repeat(64),
  name: 'Test Plugin', packagePath: process.cwd(),
  servers: [{ name: 'fixture', kind: 'stdio', command: process.execPath,
    args: [path.join(process.cwd(), 'scripts', 'fixtures', 'plugin-mcp-server.mjs')], env: {} }],
}
const denied = new ZyraPluginMcpPool([source], { authorize: async () => false })
assert.equal(denied.available()[0]?.server, 'fixture')
await assert.rejects(() => denied.listTools('plugin-test', 'fixture'), /not approved/u)
await denied.close()

let approvals = 0
const pool = new ZyraPluginMcpPool([source], { authorize: async () => { approvals++; return true } })
try {
  assert.equal(pool.connections.size, 0, 'MCP servers do not start when a Chat connects')
  const tools = await pool.listTools('plugin-test', 'fixture')
  assert.equal(tools[0]?.name, 'echo')
  assert.equal(tools[0]?.appViewUri, 'ui://fixture/echo')
  assert.equal(tools[1]?.visibleToModel, false)
  assert.equal(approvals, 1)
  const result = await pool.callTool('plugin-test', 'fixture', 'echo', { message: 'hello' })
  assert.equal(result.result.content[0]?.text, 'hello')
  assert.equal(result.appViewUri, 'ui://fixture/echo')
  assert.equal((await pool.readAppView('plugin-test', 'fixture', 'echo', 'ui://fixture/echo')).html, '<main>Fixture view</main>')
  await assert.rejects(() => pool.readAppView('plugin-test', 'fixture', 'echo', 'ui://fixture/other'), /not advertised/u)
  await assert.rejects(() => pool.callTool('plugin-test', 'fixture', 'app-action', {}), /only to its app view/u)
  assert.equal((await pool.callTool('plugin-test', 'fixture', 'app-action', { message: 'approved' }, undefined, 'app')).result.content[0]?.text, 'approved')
  assert.equal(approvals, 1, 'the Chat reuses its approved server')
  await assert.rejects(() => pool.callTool('plugin-test', 'fixture', 'unknown', {}), /not advertised/u)
  await assert.rejects(() => pool.listTools('another-plugin', 'fixture'), /not in this Chat/u)
  await pool.closeServer('plugin-test', 'fixture')
  assert.equal(pool.connections.size, 0, 'disconnect closes only the selected server')
  assert.equal((await pool.listTools('plugin-test', 'fixture'))[0]?.name, 'echo')
  assert.equal(approvals, 2, 'a later use requires a new authorized connection')
} finally { await pool.close() }
assert.equal(pool.connections.size, 0, 'ending the Chat closes MCP connections')

const httpServer = createServer(async (request, response) => {
  if (request.url === '/bearer' && request.headers.authorization !== 'Bearer fixture-token') { response.writeHead(401).end(); return }
  if (request.method === 'DELETE') { response.writeHead(200).end(); return }
  if (request.method !== 'POST') { response.writeHead(405).end(); return }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (message.id === undefined) { response.writeHead(202).end(); return }
  const result = message.method === 'initialize'
    ? { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'http-fixture', version: '1.0.0' } }
    : message.method === 'tools/list'
      ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: String(message.params?.arguments?.message || '') }] }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
})
await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
try {
  const address = httpServer.address()
  const remote = { ...source, servers: [{ name: 'remote', kind: 'http', url: `http://127.0.0.1:${address.port}/mcp` }] }
  const remotePool = new ZyraPluginMcpPool([remote], { authorize: async () => true })
  try {
    assert.equal((await remotePool.listTools('plugin-test', 'remote'))[0]?.name, 'echo')
    assert.equal((await remotePool.callTool('plugin-test', 'remote', 'echo', { message: 'remote hello' })).result.content[0]?.text, 'remote hello')
  } finally { await remotePool.close() }
  const bearer = { ...source, servers: [{ name: 'bearer', kind: 'http', url: `http://127.0.0.1:${address.port}/bearer`, bearerTokenEnvVar: 'ZYRA_MCP_TEST_TOKEN' }] }
  const bearerPool = new ZyraPluginMcpPool([bearer], { authorize: async () => true })
  try {
    await assert.rejects(() => bearerPool.listTools('plugin-test', 'bearer'), /ZYRA_MCP_TEST_TOKEN/u)
    process.env.ZYRA_MCP_TEST_TOKEN = 'fixture-token'
    assert.equal((await bearerPool.listTools('plugin-test', 'bearer'))[0]?.name, 'echo')
  } finally { delete process.env.ZYRA_MCP_TEST_TOKEN; await bearerPool.close() }
} finally { httpServer.close() }
console.log('Plugin MCP lazy connection and scoped tool calls passed.')
