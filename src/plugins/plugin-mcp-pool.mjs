import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio'
import { pluginToolAppViewUri, pluginToolVisibleToModel, readPluginAppViewResource } from './plugin-app-views.mjs'

const MAX_CONNECTED_SERVERS = 8
const IDLE_MS = 2 * 60_000
const REQUEST_MS = 30_000

function serverKey(source, server) { return `${source.pluginId}\0${source.releaseId}\0${server.name}` }

function resolveEnvironment(configured) {
  const result = { ...getDefaultEnvironment() }
  for (const [name, value] of Object.entries(configured || {})) {
    const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(value)
    if (variable) {
      if (!process.env[variable[1]]) throw new Error(`MCP server needs environment variable ${variable[1]}.`)
      result[name] = process.env[variable[1]]
    } else result[name] = value
  }
  return result
}

function makeTransport(source, server, authProvider) {
  if (server.kind === 'http') {
    const bearerProvider = server.bearerTokenEnvVar ? { token: async () => {
      const token = process.env[server.bearerTokenEnvVar]
      if (!token) throw new Error(`MCP server needs environment variable ${server.bearerTokenEnvVar}.`)
      return token
    } } : undefined
    return new StreamableHTTPClientTransport(new URL(server.url), { authProvider: authProvider || bearerProvider })
  }
  return new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd: source.packagePath,
    env: resolveEnvironment(server.env),
    stderr: 'ignore',
    maxBufferSize: 2 * 1024 * 1024,
  })
}

/** Connection ownership belongs to one Chat runtime, not to the installation. */
export class ZyraPluginMcpPool {
  constructor(sources, options = {}) {
    this.sources = Array.isArray(sources) ? sources : []
    this.authorize = options.authorize
    this.authProviderFor = options.authProviderFor
    this.clientFor = options.clientFor
    this.connections = new Map()
    this.pending = new Map()
    this.pendingControllers = new Map()
    this.borrowers = new Map()
    this.closed = false
    this.idleTimer = setInterval(() => { void this.closeIdle() }, 30_000)
    this.idleTimer.unref?.()
  }

  available() {
    return this.sources.flatMap((source) => source.servers.map((server) => ({
      pluginId: source.pluginId, pluginName: source.name, server: server.name, kind: server.kind,
    })))
  }

  find(pluginId, serverName) {
    const source = this.sources.find((entry) => entry.pluginId === pluginId)
    const server = source?.servers.find((entry) => entry.name === serverName)
    if (!source || !server) throw new Error('MCP server is not in this Chat Plugin scope.')
    return { source, server, key: serverKey(source, server) }
  }

  async connect(pluginId, serverName, signal) {
    if (this.closed) throw new Error('This Chat MCP scope has ended.')
    const { source, server, key } = this.find(pluginId, serverName)
    const existing = this.connections.get(key)
    if (existing) { existing.lastUsed = Date.now(); return existing.client }
    if (this.pending.has(key)) return this.pending.get(key)
    let evicted
    if (this.connections.size + this.pending.size >= MAX_CONNECTED_SERVERS) {
      const candidate = [...this.connections].filter(([key, entry]) => !entry.active && !this.borrowers.has(key)).sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
      if (!candidate) throw new Error(`This Chat can connect to at most ${MAX_CONNECTED_SERVERS} MCP servers at once. Wait for an active request to finish.`)
      this.connections.delete(candidate[0])
      evicted = candidate[1]
    }
    const controller = new AbortController()
    const connectSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    this.pendingControllers.set(key, controller)
    const pending = (async () => {
      // Reserve the new pending slot before awaiting an idle client's teardown.
      // Never evict a connection borrowed by a running call or app view read.
      if (evicted) await evicted.client.close()
      connectSignal.throwIfAborted()
      if (typeof this.authorize !== 'function' || await this.authorize({ source, server, signal: connectSignal }) !== true) {
        throw new Error('MCP connection was not approved.')
      }
      // Host-owned API adapters retain the same pinned scope and permission path.
      // Packages cannot select an adapter or supply its authorization credentials.
      connectSignal.throwIfAborted()
      const adapted = await this.clientFor?.({ source, server, signal: connectSignal })
      const authProvider = !adapted && server.kind === 'http' ? await this.authProviderFor?.({ source, server }) : undefined
      const transport = adapted ? null : makeTransport(source, server, authProvider)
      const client = adapted || new Client({ name: 'zyra', version: '0.6.2' })
      try {
        if (transport) await client.connect(transport, { signal: connectSignal, timeout: REQUEST_MS })
        connectSignal.throwIfAborted()
        if (this.closed) throw new Error('This Chat MCP scope has ended.')
        const entry = { client, transport, lastUsed: Date.now(), active: 0 }
        this.connections.set(key, entry)
        return client
      } catch (error) {
        await client.close().catch(() => undefined)
        await transport?.close().catch(() => undefined)
        throw error
      }
    })()
    this.pending.set(key, pending)
    try { return await pending } finally { this.pending.delete(key); this.pendingControllers.delete(key) }
  }

  async withClient(pluginId, serverName, signal, run) {
    const { key } = this.find(pluginId, serverName)
    // Reserve the borrow before the first await so another connection cannot
    // evict this entry between a resolved connect and the request continuation.
    this.borrowers.set(key, (this.borrowers.get(key) || 0) + 1)
    let entry
    try {
      const client = await this.connect(pluginId, serverName, signal)
      const current = this.connections.get(key)
      if (!current || current.client !== client || this.closed) throw new Error('This Plugin connection ended before the request could start.')
      entry = current
      entry.active += 1
      return await run(client)
    } finally {
      const remaining = this.borrowers.get(key) - 1
      if (remaining) this.borrowers.set(key, remaining)
      else this.borrowers.delete(key)
      if (entry) { entry.active -= 1; entry.lastUsed = Date.now() }
    }
  }

  async advertisedTools(client, signal) {
    const result = await client.listTools(undefined, { signal, timeout: REQUEST_MS })
    const tools = result.tools.slice(0, 128).map((tool) => ({
      name: tool.name, description: String(tool.description || '').slice(0, 1000), inputSchema: tool.inputSchema,
      appViewUri: pluginToolAppViewUri(tool), visibleToModel: pluginToolVisibleToModel(tool),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }))
    if (Buffer.byteLength(JSON.stringify(tools), 'utf8') > 256 * 1024) throw new Error('MCP tool discovery exceeds Zyra’s output limit.')
    return tools
  }

  async listTools(pluginId, serverName, signal) {
    return this.withClient(pluginId, serverName, signal, client => this.advertisedTools(client, signal))
  }

  async callTool(pluginId, serverName, toolName, args, signal, origin = 'model') {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('MCP tool arguments must be an object.')
    if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 64 * 1024) throw new Error('MCP tool arguments exceed Zyra’s input limit.')
    return this.withClient(pluginId, serverName, signal, async client => {
      const tools = await this.advertisedTools(client, signal)
      const tool = tools.find((candidate) => candidate.name === toolName)
      if (!tool) throw new Error('MCP tool is not advertised by this server.')
      if (origin !== 'app' && !tool.visibleToModel) throw new Error('This MCP tool is available only to its app view.')
      const result = await client.callTool({ name: toolName, arguments: args }, { signal, timeout: REQUEST_MS })
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 256 * 1024) throw new Error('MCP tool result exceeds Zyra’s output limit.')
      return { result, appViewUri: tool.appViewUri }
    })
  }

  async readAppView(pluginId, serverName, toolName, uri, signal) {
    return this.withClient(pluginId, serverName, signal, async client => {
      const tools = await this.advertisedTools(client, signal)
      if (!tools.some((tool) => tool.name === toolName && tool.appViewUri === uri)) throw new Error('This app view is not advertised by the selected Plugin tool.')
      return readPluginAppViewResource(await client.readResource({ uri }, { signal, timeout: REQUEST_MS }), uri)
    })
  }

  async closeIdle(now = Date.now()) {
    await Promise.all([...this.connections].filter(([key, entry]) => !entry.active && !this.borrowers.has(key) && now - entry.lastUsed >= IDLE_MS).map(async ([key, entry]) => {
      this.connections.delete(key)
      await entry.client.close().catch(() => undefined)
    }))
  }

  async closeServer(pluginId, serverName) {
    const { key } = this.find(pluginId, serverName)
    this.pendingControllers.get(key)?.abort(new Error('Plugin server disconnected.'))
    const pending = this.pending.get(key)
    if (pending) await Promise.allSettled([pending])
    const entry = this.connections.get(key)
    if (!entry) return
    this.connections.delete(key)
    await entry.client.close().catch(() => undefined)
  }

  async close() {
    this.closed = true
    clearInterval(this.idleTimer)
    for (const controller of this.pendingControllers.values()) controller.abort(new Error('This Chat MCP scope has ended.'))
    await Promise.allSettled([...this.pending.values()])
    const entries = [...this.connections.values()]
    this.connections.clear()
    await Promise.all(entries.map((entry) => entry.client.close().catch(() => undefined)))
  }
}
