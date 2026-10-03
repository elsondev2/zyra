import readline from 'node:readline'

const lines = readline.createInterface({ input: process.stdin })
for await (const line of lines) {
  let message
  try { message = JSON.parse(line) } catch { continue }
  if (message.id === undefined) continue
  const reply = (result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
  if (message.method === 'initialize') reply({
    protocolVersion: message.params?.protocolVersion || '2025-06-18',
    capabilities: { tools: {}, resources: {} },
    serverInfo: { name: 'zyra-test-mcp', version: '1.0.0' },
  })
  else if (message.method === 'tools/list') reply({ tools: [{
    name: 'echo', description: 'Echo a message.',
    _meta: { ui: { resourceUri: 'ui://fixture/echo' } },
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
  }, {
    name: 'app-action', description: 'Only an app view may invoke this action.',
    _meta: { ui: { visibility: ['app'] } }, inputSchema: { type: 'object' },
  }] })
  else if (message.method === 'resources/read') reply({ contents: [{ uri: message.params?.uri, mimeType: 'text/html;profile=mcp-app', text: '<main>Fixture view</main>' }] })
  else if (message.method === 'tools/call') reply({ content: [{ type: 'text', text: String(message.params?.arguments?.message || '') }] })
  else process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })}\n`)
}
