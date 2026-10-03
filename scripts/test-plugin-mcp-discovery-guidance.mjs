import assert from 'node:assert/strict'
import { createPluginMcpTool } from '../src/plugins/plugin-mcp-tool.mjs'

const requests = []
const tool = createPluginMcpTool({ request: async (input) => {
  requests.push(input)
  return { servers: [{ pluginId: 'notion', server: 'notion' }] }
} })
assert.match(tool.description, /no plugin mention, slash command, or Use in Chat action is required/u)
assert.match(tool.description, /does not establish whether the user has signed in elsewhere/u)
const result = await tool.execute('discover', { action: 'servers' })
assert.deepEqual(requests, [{ operation: 'plugin_mcp', action: 'servers' }])
assert.equal(result.details.servers[0].pluginId, 'notion')
const failedTool = createPluginMcpTool({ request: async () => ({ pluginId: 'fixture', server: 'fixture', tool: 'read', result: { content: [{ type: 'text', text: 'Provider denied this operation.' }], isError: true } }) })
const failed = await failedTool.execute('failed-call', { action: 'call', pluginId: 'fixture', server: 'fixture', tool: 'read', arguments: {} })
assert.equal(failed.isError, true, 'a provider error is not a successful plugin action')
assert.equal(failed.details.result.isError, true)
console.log('Plugin automatic discovery, exact runtime authority and provider failure propagation: ok')
