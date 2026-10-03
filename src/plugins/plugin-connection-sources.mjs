import { createHash } from 'node:crypto'
import { ZyraPluginValidationError } from './plugin-contract.mjs'
import { parseZyraPluginAppConnections, parseZyraPluginConnectionConfig } from './plugin-app-connections.mjs'

function invalid(message) {
  throw new ZyraPluginValidationError('PLUGIN_MCP_CONFIG_INVALID', message)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

// Hash parsed/normalized descriptors, never persist commands, environment values,
// OAuth client secrets or endpoint query values as additional pin metadata.
export function pluginConnectionDescriptorDigest(server) {
  return createHash('sha256').update(JSON.stringify(canonical(server)), 'utf8').digest('hex')
}

export function mergeZyraPluginConnectionSources(...sources) {
  const byName = new Map()
  for (const server of sources.flat()) {
    const previous = byName.get(server.name)
    if (previous && pluginConnectionDescriptorDigest(previous) !== pluginConnectionDescriptorDigest(server)) {
      invalid(`Plugin MCP sources conflict for server ${server.name}.`)
    }
    if (!previous) byName.set(server.name, server)
    if (byName.size > 32) invalid('Plugin MCP sources exceed 32 servers.')
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
}

/** An opaque ID alone references an identity, not a second set of OAuth
 * settings. If its exact mapped endpoint is already native, retain the explicit
 * reviewed native descriptor. Explicit app options still participate in conflict
 * detection and can never replace or broaden those settings. */
export function reconcileZyraPluginAppReferences(nativeServers, appServers, apps) {
  const native = new Map(nativeServers.map(server => [server.name, server]))
  return appServers.map(server => {
    const reference = apps?.[server.name]
    const existing = native.get(server.name)
    return reference && Object.keys(reference).length === 1 && typeof reference.id === 'string'
      && existing?.kind === 'http' && existing.url === server.url ? existing : server
  })
}

export function createZyraPluginConnectionPins(servers) {
  return servers.map(server => ({ name: server.name, descriptorDigest: pluginConnectionDescriptorDigest(server) }))
}

export function normalizeZyraPluginConnectionPins(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 32) invalid('Plugin MCP descriptor pins are invalid.')
  const seen = new Set()
  return value.map(pin => {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin) || typeof pin.name !== 'string' || typeof pin.descriptorDigest !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(pin.name)
      || !/^[a-f0-9]{64}$/u.test(pin.descriptorDigest) || seen.has(pin.name)) invalid('Plugin MCP descriptor pins are invalid.')
    seen.add(pin.name)
    return { name: pin.name, descriptorDigest: pin.descriptorDigest }
  }).sort((left, right) => left.name.localeCompare(right.name))
}

export function capZyraPluginConnectionServers(servers, pins) {
  if (pins === undefined) return servers
  const reviewed = new Map(normalizeZyraPluginConnectionPins(pins).map(pin => [pin.name, pin.descriptorDigest]))
  return servers.filter(server => reviewed.get(server.name) === pluginConnectionDescriptorDigest(server))
}

export function parsePinnedZyraPluginConnectionConfig(text, registeredApps, pins) {
  if (registeredApps && pins === undefined) {
    // Keep explicit URLs and the frozen pre-pin bridge set that established
    // these non-null app contributions. Today's additions cannot expand them.
    return parseZyraPluginAppConnections(text, { legacyBridgesOnly: true }).servers
  }
  return capZyraPluginConnectionServers(parseZyraPluginConnectionConfig(text, registeredApps), pins)
}
