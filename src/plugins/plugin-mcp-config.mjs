import { ZyraPluginValidationError } from './plugin-contract.mjs'

const SERVER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u
const MAX_SERVERS = 32

function invalid(message) {
  throw new ZyraPluginValidationError('PLUGIN_MCP_CONFIG_INVALID', message)
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function boundedString(value, label, limit = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
    invalid(`Plugin MCP ${label} must be a non-empty bounded string.`)
  }
  return value
}

export function parseZyraPluginMcpConfig(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 64 * 1024) {
    invalid('Plugin MCP configuration exceeds its 64 KB limit.')
  }
  let parsed
  try { parsed = JSON.parse(text) } catch { invalid('Plugin MCP configuration is not valid JSON.') }
  const root = record(parsed)
  if (!root) invalid('Plugin MCP configuration must be an object.')
  // Both the Codex wrapper and the older flat server map occur in packages.
  const servers = record(root.mcpServers ?? root.mcp_servers ?? root)
  if (!servers) invalid('Plugin MCP servers must be an object.')
  const entries = Object.entries(servers)
  if (entries.length > MAX_SERVERS) invalid(`Plugin MCP configuration exceeds ${MAX_SERVERS} servers.`)
  return entries.map(([name, value]) => {
    if (!SERVER_NAME.test(name)) invalid('Plugin MCP server has an invalid name.')
    const server = record(value)
    if (!server) invalid(`Plugin MCP server ${name} must be an object.`)
    const hasUrl = server.url !== undefined
    const hasCommand = server.command !== undefined
    if (hasUrl === hasCommand) invalid(`Plugin MCP server ${name} needs exactly one URL or command.`)
    if (hasUrl) {
      if (server.type !== undefined && !['http', 'streamable-http', 'streamable_http'].includes(server.type)) invalid(`Plugin MCP server ${name} has an unsupported transport type.`)
      const rawUrl = boundedString(server.url, `${name} URL`)
      let url
      try { url = new URL(rawUrl) } catch { invalid(`Plugin MCP server ${name} has an invalid URL.`) }
      if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) || url.username || url.password || !url.hostname) {
        invalid(`Plugin MCP server ${name} must use HTTPS or local HTTP without embedded credentials.`)
      }
      const result = { name, kind: 'http', url: url.toString() }
      if (server.bearer_token_env_var !== undefined) {
        if (typeof server.bearer_token_env_var !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(server.bearer_token_env_var)) invalid(`Plugin MCP server ${name} has an invalid bearer token variable.`)
        result.bearerTokenEnvVar = server.bearer_token_env_var
      }
      if (server.oauth_resource !== undefined) {
        let resource
        try { resource = new URL(boundedString(server.oauth_resource, `${name} OAuth resource`)) }
        catch { invalid(`Plugin MCP server ${name} has an invalid OAuth resource.`) }
        if (resource.origin !== url.origin || resource.username || resource.password) invalid(`Plugin MCP server ${name} OAuth resource must share the server origin.`)
        result.oauthResource = resource.toString()
      }
      if (server.scopes !== undefined) {
        if (!Array.isArray(server.scopes) || server.scopes.length > 32) invalid(`Plugin MCP server ${name} has invalid OAuth scopes.`)
        result.scopes = server.scopes.map((scope) => boundedString(scope, `${name} OAuth scope`, 256))
      }
      if (server.oauth !== undefined) {
        const oauth = record(server.oauth)
        if (!oauth) invalid(`Plugin MCP server ${name} has invalid OAuth client configuration.`)
        const clientId = boundedString(oauth.client_id, `${name} OAuth client ID`, 2048)
        const clientSecret = oauth.client_secret === undefined ? undefined : boundedString(oauth.client_secret, `${name} OAuth client secret`, 2048)
        const callbackPort = oauth.callback_port === undefined ? undefined : Number(oauth.callback_port)
        if (callbackPort !== undefined && (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535)) invalid(`Plugin MCP server ${name} has an invalid OAuth callback port.`)
        result.oauth = { clientId, ...(clientSecret ? { clientSecret } : {}), ...(callbackPort ? { callbackPort } : {}) }
      }
      return result
    }
    if (server.type !== undefined && server.type !== 'stdio') invalid(`Plugin MCP server ${name} has an unsupported transport type.`)
    const command = boundedString(server.command, `${name} command`, 512)
    if (server.args !== undefined && (!Array.isArray(server.args) || server.args.length > 128)) {
      invalid(`Plugin MCP server ${name} has invalid arguments.`)
    }
    const args = (server.args ?? []).map((arg) => boundedString(arg, `${name} argument`, 2048))
    if (server.env !== undefined && !record(server.env)) invalid(`Plugin MCP server ${name} has invalid environment values.`)
    const env = Object.entries(server.env ?? {})
    if (env.length > 64) invalid(`Plugin MCP server ${name} has too many environment values.`)
    for (const [key, val] of env) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/u.test(key)) invalid(`Plugin MCP server ${name} has an invalid environment name.`)
      boundedString(val, `${name} environment value`, 4096)
    }
    return { name, kind: 'stdio', command, args, env: Object.fromEntries(env) }
  })
}
