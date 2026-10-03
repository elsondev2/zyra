import assert from 'node:assert/strict'
import { parseZyraPluginMcpConfig } from '../src/plugins/plugin-mcp-config.mjs'
import { parseZyraPluginAppConnections, parseZyraPluginConnectionConfig } from '../src/plugins/plugin-app-connections.mjs'

assert.deepEqual(parseZyraPluginMcpConfig('{}'), [])
assert.deepEqual(parseZyraPluginMcpConfig(JSON.stringify({
  mcpServers: {
    remote: { url: 'https://example.com/mcp' },
    local: { command: 'node', args: ['server.mjs'], env: { API_KEY: '${API_KEY}' } },
  },
})), [
  { name: 'remote', kind: 'http', url: 'https://example.com/mcp' },
  { name: 'local', kind: 'stdio', command: 'node', args: ['server.mjs'], env: { API_KEY: '${API_KEY}' } },
])
assert.equal(parseZyraPluginMcpConfig('{"flat":{"url":"http://127.0.0.1:3000/mcp"}}')[0].name, 'flat')
assert.deepEqual(parseZyraPluginMcpConfig(JSON.stringify({ mcpServers: {
  secure: { type: 'http', url: 'https://example.com/mcp', bearer_token_env_var: 'PLUGIN_TOKEN', oauth_resource: 'https://example.com/resource', scopes: ['read'], oauth: { client_id: 'public-client', client_secret: 'fixture-secret', callback_port: 12798 } },
} }))[0], {
  name: 'secure', kind: 'http', url: 'https://example.com/mcp', bearerTokenEnvVar: 'PLUGIN_TOKEN',
  oauthResource: 'https://example.com/resource', scopes: ['read'],
  oauth: { clientId: 'public-client', clientSecret: 'fixture-secret', callbackPort: 12798 },
})

for (const input of [
  '{', '[]', '{"mcpServers":[]}',
  '{"mcpServers":{"bad name":{"url":"https://example.com"}}}',
  '{"mcpServers":{"bad":{"url":"file:///secret"}}}',
  '{"mcpServers":{"bad":{"url":"https://token@example.com/mcp"}}}',
  '{"mcpServers":{"bad":{"url":"https://example.com","command":"node"}}}',
  '{"mcpServers":{"bad":{"url":"http://remote.example/mcp"}}}',
  '{"mcpServers":{"bad":{"url":"https://example.com/mcp","oauth_resource":"https://other.example/resource"}}}',
  '{"mcpServers":{"bad":{"command":"node","args":[3]}}}',
  '{"mcpServers":{"bad":{"command":"node","env":{"BAD-NAME":"value"}}}}',
]) assert.throws(() => parseZyraPluginMcpConfig(input), { code: 'PLUGIN_MCP_CONFIG_INVALID' })

assert.deepEqual(parseZyraPluginAppConnections('{}'), { servers: [], unresolved: [] })
const apps = parseZyraPluginAppConnections(JSON.stringify({ apps: {
  clickup: { id: 'asdk_app_69431e6d26b88191b4029488aeb42f5b' },
  monday: { id: 'connector_690aabb71bf481918b8d5b614ed3fd4c' },
  stripe: { id: 'asdk_app_6983c208e5f8819196b7511519f97993' },
  supabase: { id: 'asdk_app_69d3e5ee6a708191baa733f7b8931995' },
  atlassian: { id: 'connector_692de805e3ec8191834719067174a384' },
  granola: { id: 'asdk_app_697761cab6f48191b5ed345919a3ce8b' },
  posthog: { id: 'asdk_app_699caef2d680819188727b0ddbb349dd' },
  airtable: { id: 'asdk_app_693ca6ce2db08191bb52d66743c65184' },
  gmail: { id: 'connector_2128aebfecb84f64a069897515042a44' },
  drive: { id: 'connector_5f3c8c41a1e54ad7a76272c89e2554fa' },
  calendar: { id: 'connector_947e0d954944416db111db556030eea6' },
  unknown: { id: 'asdk_app_unknown' },
  explicit: { id: 'asdk_app_custom', url: 'https://custom.example/mcp', scopes: ['read'] },
} }))
assert.equal(apps.servers.length, 12)
assert.equal(apps.servers.find(server => server.name === 'gmail').url, 'https://gmailmcp.googleapis.com/mcp/v1')
assert.equal(apps.servers.find(server => server.name === 'drive').url, 'https://drivemcp.googleapis.com/mcp/v1')
assert.equal(apps.servers.find(server => server.name === 'calendar').url, 'https://calendarmcp.googleapis.com/mcp/v1')
assert.deepEqual(apps.servers.find(server => server.name === 'airtable'), { name: 'airtable', kind: 'http', url: 'https://mcp.airtable.com/mcp' })
assert.deepEqual(apps.unresolved, [{ name: 'unknown', id: 'asdk_app_unknown' }])
assert.deepEqual(apps.servers.at(-1), { name: 'explicit', kind: 'http', url: 'https://custom.example/mcp', scopes: ['read'] })
assert.deepEqual(parseZyraPluginAppConnections('{"apps":{"clickup":{"id":"unknown"}}}').servers, [], 'names cannot spoof a registered connection')
assert.deepEqual(parseZyraPluginConnectionConfig('{"mcpServers":{"custom":{"url":"https://example.com"}}}'), [{ name: 'custom', kind: 'http', url: 'https://example.com/' }])
for (const input of ['{', '[]', '{"apps":[]}', '{"apps":{"bad name":{"id":"id"}}}', '{"apps":{"bad":{"id":"id/escape"}}}', '{"apps":{"bad":{}}}']) {
  assert.throws(() => parseZyraPluginAppConnections(input), { code: 'PLUGIN_APP_CONFIG_INVALID' })
}
for (const url of ['', 'file:///secret', 'https://token@example.com/mcp', 'http://remote.example/mcp']) {
  assert.throws(() => parseZyraPluginAppConnections(JSON.stringify({ apps: { bad: { id: 'unknown', url } } })), { code: 'PLUGIN_MCP_CONFIG_INVALID' })
}
console.log('Plugin MCP and registered app configuration validation passed.')
