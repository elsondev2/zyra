import { Type } from 'typebox'
import { defineZyraTool } from '../agents/define-zyra-tool.mjs'

export function createPluginMcpTool(client) {
  return defineZyraTool({
    name: 'plugin_mcp',
    label: 'Plugin MCP',
    description: 'Discover available plugin integrations whenever they can help with the user’s task; no plugin mention, slash command, or Use in Chat action is required from the user. List MCP servers available to this Chat, inspect a server’s advertised tools, then call the relevant tool. Connections are lazy and follow the chat permission mode. Full access does not require approval. Use only the exact plugin, server, and tool returned by discovery. An empty server list means no integration is available to this Chat; it does not establish whether the user has signed in elsewhere.',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('servers'), Type.Literal('tools'), Type.Literal('call')]),
      pluginId: Type.Optional(Type.String()),
      server: Type.Optional(Type.String()),
      tool: Type.Optional(Type.String()),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    execute: async (_toolCallId, input = {}, signal) => {
      if (!client) return { content: [{ type: 'text', text: 'Plugin MCP is unavailable on this surface.' }] }
      try {
        const result = await client.request({ operation: 'plugin_mcp', ...input }, { signal, timeoutMs: 60_000 })
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result, ...(result?.result?.isError === true ? { isError: true } : {}) }
      } catch (error) {
        return { content: [{ type: 'text', text: `Plugin MCP failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  })
}
