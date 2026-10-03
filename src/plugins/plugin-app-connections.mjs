import { ZyraPluginValidationError } from './plugin-contract.mjs'
import { parseZyraPluginMcpConfig } from './plugin-mcp-config.mjs'

// Registered OpenAI app IDs are opaque references, not server URLs. Only bridge
// exact identities whose publishers document a public MCP endpoint. Never infer
// an endpoint from a plugin name, website, or an untrusted publisher description.
// Freeze the established bridge set for legacy non-null app contribution pins.
// New mappings need fresh review metadata, not inference from today's catalog.
const LEGACY_PUBLIC_SERVERS = Object.freeze({
  // https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server
  asdk_app_69431e6d26b88191b4029488aeb42f5b: 'https://mcp.clickup.com/mcp',
  // https://developer.monday.com/api-reference/docs/integrate-with-monday-mcp
  connector_690aabb71bf481918b8d5b614ed3fd4c: 'https://mcp.monday.com/mcp',
  // https://docs.stripe.com/mcp
  asdk_app_6983c208e5f8819196b7511519f97993: 'https://mcp.stripe.com/',
  // https://supabase.com/docs/guides/ai-tools/mcp
  asdk_app_69d3e5ee6a708191baa733f7b8931995: 'https://mcp.supabase.com/mcp',
  // https://atlassian.github.io/atlassian-mcp-server/
  connector_692de805e3ec8191834719067174a384: 'https://mcp.atlassian.com/v2/mcp',
  // https://docs.granola.ai/help-center/sharing/integrations/mcp
  asdk_app_697761cab6f48191b5ed345919a3ce8b: 'https://mcp.granola.ai/mcp',
  // https://posthog.com/docs/model-context-protocol/vscode
  asdk_app_699caef2d680819188727b0ddbb349dd: 'https://mcp.posthog.com/mcp',
  // https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server
  asdk_app_693ca6ce2db08191bb52d66743c65184: 'https://mcp.airtable.com/mcp',
  // https://developers.google.com/workspace/guides/configure-mcp-servers
  connector_2128aebfecb84f64a069897515042a44: 'https://gmailmcp.googleapis.com/mcp/v1',
  connector_5f3c8c41a1e54ad7a76272c89e2554fa: 'https://drivemcp.googleapis.com/mcp/v1',
  connector_947e0d954944416db111db556030eea6: 'https://calendarmcp.googleapis.com/mcp/v1',
})

const PUBLIC_SERVERS = Object.freeze({
  ...LEGACY_PUBLIC_SERVERS,
  // https://linear.app/docs/mcp documents Streamable HTTP and public OAuth DCR.
  asdk_app_69a089a326dc8191b32a3f2553f5be2c: 'https://mcp.linear.app/mcp',
  // https://developers.notion.com/guides/mcp/get-started-with-mcp
  asdk_app_69c18c28f1188191bf5b8445c4ab0a2e: 'https://mcp.notion.com/mcp',
})

const invalid = (message) => { throw new ZyraPluginValidationError('PLUGIN_APP_CONFIG_INVALID', message) }
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)

export function parseZyraPluginAppConnections(text, { legacyBridgesOnly = false } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 64 * 1024) invalid('Plugin app connections exceed their 64 KB limit.')
  let root
  try { root = JSON.parse(text) } catch { invalid('Plugin app connections are not valid JSON.') }
  if (!record(root) || (root.apps !== undefined ? !record(root.apps) : Object.keys(root).length > 0)) invalid('Plugin app connections need an apps object.')
  const entries = Object.entries(root.apps ?? {})
  if (entries.length > 32) invalid('Plugin app connections exceed 32 entries.')
  const servers = [], unresolved = []
  for (const [name, app] of entries) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(name) || !record(app)) invalid('Plugin app connection has an invalid name or value.')
    if (app.id !== undefined && (typeof app.id !== 'string' || !/^[a-zA-Z0-9_-]{1,192}$/u.test(app.id))) invalid(`Plugin app connection ${name} has an invalid registered ID.`)
    const bridges = legacyBridgesOnly ? LEGACY_PUBLIC_SERVERS : PUBLIC_SERVERS
    const url = app.url !== undefined ? app.url : (app.id && Object.hasOwn(bridges, app.id) ? bridges[app.id] : null)
    if (app.url !== undefined || url) {
      // Share URL/transport/OAuth validation with ordinary MCP packages. Explicit
      // endpoints work for any publisher; no provider-specific client logic.
      servers.push(...parseZyraPluginMcpConfig(JSON.stringify({ mcpServers: { [name]: { ...app, url } } })))
    } else if (app.id) unresolved.push({ name, id: app.id })
    else invalid(`Plugin app connection ${name} needs a registered ID or MCP URL.`)
  }
  return { servers, unresolved }
}

export function parseZyraPluginConnectionConfig(text, registeredApps = false) {
  return registeredApps ? parseZyraPluginAppConnections(text).servers : parseZyraPluginMcpConfig(text)
}
