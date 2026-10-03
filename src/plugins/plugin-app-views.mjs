export const MCP_APP_VIEW_MIME = 'text/html;profile=mcp-app'
export const MAX_MCP_APP_VIEW_BYTES = 2 * 1024 * 1024

export function pluginToolAppViewUri(tool) {
  const meta = tool?._meta
  const uri = meta?.ui?.resourceUri ?? meta?.['ui/resourceUri']
  return typeof uri === 'string' && uri.length <= 2048 && /^ui:\/\/[^\s\u0000-\u001f]+$/u.test(uri) ? uri : null
}

export function pluginToolVisibleToModel(tool) {
  const visibility = tool?._meta?.ui?.visibility
  return !Array.isArray(visibility) || visibility.includes('model')
}

export function readPluginAppViewResource(response, uri) {
  const contents = response?.contents
  if (!Array.isArray(contents) || contents.length !== 1) throw new Error('Plugin app view has no single UI resource.')
  const content = contents[0]
  if (content?.uri !== uri || content?.mimeType !== MCP_APP_VIEW_MIME) throw new Error('Plugin app view resource has an unsupported type.')
  if (typeof content.blob === 'string' && content.blob.length > MAX_MCP_APP_VIEW_BYTES * 2) throw new Error('Plugin app view is too large.')
  const html = typeof content.text === 'string' ? content.text
    : typeof content.blob === 'string' ? Buffer.from(content.blob, 'base64').toString('utf8') : null
  if (!html || Buffer.byteLength(html, 'utf8') > MAX_MCP_APP_VIEW_BYTES) throw new Error('Plugin app view is empty or too large.')
  const cspInput = content?._meta?.ui?.csp
  const csp = {}
  for (const key of ['connectDomains', 'resourceDomains']) {
    csp[key] = Array.isArray(cspInput?.[key]) ? cspInput[key].slice(0, 16).filter((entry) => {
      if (typeof entry !== 'string' || entry.length > 255) return false
      try { const url = new URL(entry); return url.protocol === 'https:' && url.origin === entry } catch { return false }
    }) : []
  }
  return { html, csp }
}
