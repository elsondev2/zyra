import assert from 'node:assert/strict'
import { ZyraPluginMcpPool } from '../src/plugins/plugin-mcp-pool.mjs'
const source = { pluginId: 'gmail-test', releaseId: 'release-test', name: 'Gmail', servers: [{ name: 'gmail', kind: 'http', url: 'https://gmailmcp.googleapis.com/mcp/v1' }] }
let created = 0
let closed = 0
const client = {
  listTools: async () => ({ tools: [{ name: 'search_threads', description: 'Read Gmail via API.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }),
  callTool: async ({ name }) => ({ content: [{ type: 'text', text: name }] }),
  close: async () => { closed++ },
}
const originalFetch = globalThis.fetch
let remoteRequests = 0
globalThis.fetch = async () => { remoteRequests++; return new Response('Developer Preview required', { status: 403 }) }
const denied = new ZyraPluginMcpPool([source], { authorize: async () => false, clientFor: async () => { created++; return client } })
const pool = new ZyraPluginMcpPool([source], { authorize: async () => true, clientFor: async () => { created++; return client } })
try {
  await assert.rejects(() => denied.listTools('gmail-test', 'gmail'), /not approved/u)
  assert.equal(created, 0, 'adapters never bypass pinned-source authorization')
  assert.equal((await pool.listTools('gmail-test', 'gmail'))[0].name, 'search_threads')
  assert.equal((await pool.listTools('gmail-test', 'gmail'))[0].annotations.readOnlyHint, true)
  assert.equal((await pool.callTool('gmail-test', 'gmail', 'search_threads', {})).result.content[0].text, 'search_threads')
  assert.equal(remoteRequests, 0, 'the adapted plugin does not contact the preview MCP endpoint')
  assert.equal(created, 1, 'adapter ownership and reuse stay inside the chat pool')
  await pool.closeServer('gmail-test', 'gmail')
  assert.equal(closed, 1)
  await assert.rejects(() => pool.callTool('other-plugin', 'gmail', 'search_threads', {}), /not in this Chat/u)
  let started
  const waiting = new Promise(resolve => { started = resolve })
  const pendingPool = new ZyraPluginMcpPool([source], { authorize: async () => true, clientFor: async ({ signal }) => {
    started()
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  } })
  try {
    const pending = pendingPool.listTools('gmail-test', 'gmail')
    void pending.catch(() => undefined)
    await waiting
    await pendingPool.closeServer('gmail-test', 'gmail')
    await assert.rejects(() => pending, /disconnected/u)
    assert.equal(pendingPool.connections.size, 0, 'disconnect aborts a pending adapter before it becomes a connection')
  } finally { await pendingPool.close() }
  const manySource = { ...source, servers: Array.from({ length: 10 }, (_, index) => ({ name: `server-${index}`, kind: 'http', url: `https://example.test/${index}` })) }
  const evicted = []
  let holdRead = false
  let releaseRead
  const held = new Promise(resolve => { releaseRead = resolve })
  const many = new ZyraPluginMcpPool([manySource], { authorize: async () => true, clientFor: async ({ server }) => ({ ...client,
    listTools: async () => { if (holdRead && server.name === 'server-2') await held; return client.listTools() },
    close: async () => { evicted.push(server.name) },
  }) })
  const clock = Date.now
  Date.now = () => 1000
  try {
    for (const server of manySource.servers) await many.listTools(source.pluginId, server.name)
    assert.equal(many.connections.size, 8, 'the resource cap limits simultaneous connections, not the number of installed integrations usable in a chat')
    assert.deepEqual(evicted, ['server-0', 'server-1'])
    holdRead = true
    const activeRead = many.listTools(source.pluginId, 'server-2')
    // No tick between borrow and capacity pressure: protect the await gap too.
    await many.listTools(source.pluginId, 'server-0')
    assert.equal(evicted.at(-1), 'server-3', 'the oldest borrowed connection is not evicted')
    await many.closeIdle(1_000_000)
    assert.equal(evicted.includes('server-2'), false, 'idle maintenance does not interrupt an active read')
    releaseRead()
    await activeRead
    await assert.rejects(() => many.callTool(source.pluginId, 'server-2', 'search_threads', { text: 'x'.repeat(65536) }), /input limit/u)
  } finally { Date.now = clock; releaseRead(); await many.close() }
  console.log('Plugin adapters preserve pinned authorization, failure/cancellation and bounded multi-plugin connection reuse without preview traffic.')
} finally { await denied.close(); await pool.close(); globalThis.fetch = originalFetch }
