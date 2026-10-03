import { GMAIL_API_TOOLS, GMAIL_API_SCOPE_GROUPS, gmailCapabilityGranted, validateGmailArguments } from './gmail-api-tools.mjs'
import { composeGmailMessage, readableGmailMessage } from './gmail-api-mime.mjs'
const ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me/'
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_RESULT_BYTES = 256 * 1024
const segment = value => encodeURIComponent(value)
const messageIds = message => ({ id: message?.id, threadId: message?.threadId, labelIds: message?.labelIds })
function readableThread(thread, full, options) {
  return { id: thread.id, historyId: thread.historyId, snippet: thread.snippet,
    messages: (thread.messages || []).map(message => full ? readableGmailMessage(message, options) : { ...messageIds(message), snippet: message.snippet,
      headers: (message.payload?.headers || []).filter(item => ['from', 'to', 'cc', 'bcc', 'subject', 'date'].includes(item.name?.toLowerCase())),
    }),
  }
}
async function responseJson(response) {
  if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) throw new Error('Gmail response exceeds the read size limit. Use a minimal view or smaller query.')
  const reader = response.body?.getReader()
  if (!reader) return {}
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new Error('Gmail response exceeds the read size limit. Use a minimal view or smaller query.')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  finally { reader.releaseLock() }
  if (!size) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new Error('Gmail returned an invalid API response.') }
}
async function mapBounded(items, run) {
  const results = new Array(items.length)
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) { const position = index++; results[position] = await run(items[position]) }
  }))
  return results
}
/** MCP-client-compatible API adapter. It receives host-owned token access only;
 * neither plugin descriptors, model arguments, nor tool results contain tokens. */
export class GmailApiClient {
  constructor({ getAccess, fetch = globalThis.fetch, onAuthorizationFailure = async () => {} }) {
    this.getAccess = getAccess
    this.fetch = fetch
    this.onAuthorizationFailure = onAuthorizationFailure
    this.controller = new AbortController()
  }
  signal(signal) {
    return AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000), ...(signal ? [signal] : [])])
  }
  async access(capability, signal, forceRefresh = false) {
    signal?.throwIfAborted()
    const access = await this.getAccess({ signal, forceRefresh })
    signal?.throwIfAborted()
    if (!gmailCapabilityGranted(access.scopes, capability)) throw new Error(`Google has not granted Gmail ${capability} access. Reconnect and choose the relevant Google permission.`)
    return access
  }
  async request(method, path, capability, { query, body, signal } = {}, refreshed = false) {
    const activeSignal = this.signal(signal)
    activeSignal.throwIfAborted()
    const access = await this.access(capability, activeSignal, refreshed)
    const url = new URL(path, ROOT)
    if (url.origin !== new URL(ROOT).origin || !url.pathname.startsWith('/gmail/v1/users/me/')) throw new Error('Invalid Gmail API destination.')
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, String(value))
    let response
    try {
      response = await this.fetch(url, { method, headers: { authorization: `Bearer ${access.accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: activeSignal, redirect: 'error',
      })
    } catch {
      throw new Error(method === 'GET' ? 'Gmail API read failed or was cancelled.' : 'Gmail API action failed or was cancelled. Its result may be uncertain; no automatic retry was made. For a send, check Sent before retrying.')
    }
    if (response.status === 401 && !refreshed) {
      await response.body?.cancel().catch(() => undefined)
      // An HTTP 401 is an explicit rejection, not an uncertain send. Retry only
      // once after refresh; never retry timeouts, disconnects, 429s or 5xxs.
      return this.request(method, path, capability, { query, body, signal }, true)
    }
    if (!response.ok) {
      const data = await responseJson(response).catch(() => ({}))
      if (response.status === 401 || response.status === 403) await this.onAuthorizationFailure(response.status)
      const reason = data.error?.errors?.[0]?.reason
      if (reason === 'accessNotConfigured' || data.error?.details?.some(item => item.reason === 'SERVICE_DISABLED')) throw new Error('The regular Gmail API is disabled for Zyra’s Google project. Enable the Gmail API and reconnect.')
      if (response.status === 401) throw new Error('Google denied Gmail authorization. Reconnect this account.')
      if (response.status === 403) throw new Error('Google denied this Gmail operation. Check the granted permission and Google account policy, then reconnect if needed.')
      if (response.status === 404) throw new Error('Gmail could not find this message, thread, draft, label or attachment.')
      throw new Error(`Gmail API rejected this request (HTTP ${response.status}).${method !== 'GET' && response.status >= 500 ? ' The action result may be uncertain; no automatic retry was made.' : ''}`)
    }
    try { return await responseJson(response) }
    catch (error) {
      if (method !== 'GET') throw new Error('Google accepted this Gmail action, but its response could not be read. Do not repeat it blindly; inspect Gmail before retrying.')
      throw error
    }
  }
  async verifyAccount({ signal } = {}) {
    const activeSignal = this.signal(signal)
    const { scopes } = await this.access('permissions', activeSignal)
    if (gmailCapabilityGranted(scopes, 'profile')) await this.request('GET', 'profile', 'profile', { signal })
    else if (gmailCapabilityGranted(scopes, 'labelsRead')) await this.request('GET', 'labels', 'labelsRead', { signal })
    else throw new Error('Google did not grant a Gmail permission that allows a safe mailbox verification. Reconnect; no email was sent.')
    return { toolCount: (await this.listTools(undefined, { signal })).tools.length }
  }
  async listTools(_params, { signal } = {}) {
    const { scopes } = await this.access('permissions', this.signal(signal))
    return { tools: GMAIL_API_TOOLS.filter(tool => gmailCapabilityGranted(scopes, tool.capability)).map(({ capability, ...tool }) => tool) }
  }
  async callTool({ name, arguments: args = {} }, { signal } = {}) {
    const tool = GMAIL_API_TOOLS.find(item => item.name === name)
    if (!tool) throw new Error('Unknown Gmail API tool.')
    validateGmailArguments(tool.inputSchema, args)
    const { scopes } = await this.access(tool.capability, this.signal(signal))
    const request = (method, path, capability = tool.capability, body, query) => this.request(method, path, capability, { body, query, signal })
    const pageQuery = { q: args.query, maxResults: args.pageSize || 10, pageToken: args.pageToken, includeSpamTrash: args.includeSpamTrash }
    let result
    if (name === 'get_permissions') result = { backend: 'gmail-api', grantedScopes: scopes, capabilities: Object.fromEntries(Object.keys(GMAIL_API_SCOPE_GROUPS).map(key => [key, gmailCapabilityGranted(scopes, key)])), chatPermissionsStillApply: true, permanentDeletionAvailable: false }
    else if (name === 'get_profile') result = await request('GET', 'profile')
    else if (name === 'search_threads') {
      const page = await request('GET', 'threads', 'read', undefined, pageQuery)
      const full = args.view === 'THREAD_VIEW_FULL'
      result = { ...page, threads: await mapBounded(page.threads || [], async item => readableThread(await request('GET', `threads/${segment(item.id)}`, 'read', undefined, { format: full ? 'full' : 'metadata' }), full)) }
    } else if (name === 'search_messages') result = await request('GET', 'messages', 'read', undefined, pageQuery)
    else if (name === 'get_thread') result = readableThread(await request('GET', `threads/${segment(args.threadId)}`, 'read', undefined, { format: args.view === 'THREAD_VIEW_MINIMAL' ? 'metadata' : 'full' }), args.view !== 'THREAD_VIEW_MINIMAL', args)
    else if (name === 'get_message') result = readableGmailMessage(await request('GET', `messages/${segment(args.messageId)}`, 'read', undefined, { format: 'full' }), args)
    else if (name === 'get_attachment') result = await request('GET', `messages/${segment(args.messageId)}/attachments/${segment(args.attachmentId)}`)
    else if (name === 'list_drafts') result = await request('GET', 'drafts', 'draftRead', undefined, pageQuery)
    else if (name === 'get_draft') { const draft = await request('GET', `drafts/${segment(args.draftId)}`, 'draftRead', undefined, { format: 'full' }); result = { id: draft.id, message: readableGmailMessage(draft.message, args) } }
    else if (name === 'create_draft' || name === 'update_draft' || name === 'send_message') {
      if (name === 'send_message' && !(args.to?.length || args.cc?.length || args.bcc?.length)) throw new Error('Sending an email requires at least one explicit recipient.')
      const reply = args.replyToMessageId ? await request('GET', `messages/${segment(args.replyToMessageId)}`, 'read', undefined, { format: 'metadata' }) : undefined
      const message = composeGmailMessage(args, reply)
      if (name === 'send_message') result = messageIds(await request('POST', 'messages/send', 'send', message))
      else { const draft = await request(name === 'create_draft' ? 'POST' : 'PUT', name === 'create_draft' ? 'drafts' : `drafts/${segment(args.draftId)}`, 'draft', { message }); result = { id: draft.id, message: messageIds(draft.message) } }
    } else if (name === 'send_draft') result = messageIds(await request('POST', 'drafts/send', 'draftSend', { id: args.draftId }))
    else if (name === 'delete_draft') { await request('DELETE', `drafts/${segment(args.draftId)}`); result = { deletedDraftId: args.draftId } }
    else if (name === 'list_labels') result = await request('GET', 'labels')
    else if (name === 'create_label') result = await request('POST', 'labels', 'labelsWrite', { name: args.name })
    else if (name === 'update_label') result = await request('PATCH', `labels/${segment(args.labelId)}`, 'labelsWrite', { name: args.name })
    else if (name === 'delete_label') { await request('DELETE', `labels/${segment(args.labelId)}`); result = { deletedLabelId: args.labelId } }
    else if (name.startsWith('update_')) {
      if (!args.addLabelIds?.length && !args.removeLabelIds?.length) throw new Error('Choose at least one label to add or remove.')
      if ([...(args.addLabelIds || []), ...(args.removeLabelIds || [])].some(label => ['TRASH', 'SPAM'].includes(label))) throw new Error('Use the dedicated trash/untrash or spam/unspam tool for those system labels.')
      const kind = name === 'update_message_labels' ? 'message' : 'thread'
      const modified = await request('POST', `${kind}s/${segment(args[`${kind}Id`])}/modify`, 'modify', { addLabelIds: args.addLabelIds || [], removeLabelIds: args.removeLabelIds || [] })
      result = kind === 'message' ? messageIds(modified) : readableThread(modified, false)
    } else {
      const kind = name.endsWith('_message') || name.includes('_message_') ? 'message' : 'thread'
      const path = `${kind}s/${segment(args[`${kind}Id`])}`
      if (name.startsWith('trash_') || name.startsWith('untrash_')) {
        const modified = await request('POST', `${path}/${name.startsWith('untrash_') ? 'untrash' : 'trash'}`)
        result = kind === 'message' ? messageIds(modified) : readableThread(modified, false)
      } else {
        const modified = await request('POST', `${path}/modify`, 'modify', name.startsWith('unmark_') ? { removeLabelIds: ['SPAM'] } : { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] })
        result = kind === 'message' ? messageIds(modified) : readableThread(modified, false)
      }
    }
    const text = JSON.stringify(result)
    const response = { content: [{ type: 'text', text }] }
    if (Buffer.byteLength(JSON.stringify(response)) > MAX_RESULT_BYTES) throw new Error(tool.annotations.readOnlyHint ? 'Gmail result exceeds the tool size limit. Use a minimal view, smaller page, or read individual messages.' : 'Google accepted this Gmail action, but its result exceeds the display limit. Inspect Gmail; do not repeat the action blindly.')
    return response
  }
  async close() { this.controller.abort(new Error('Gmail connection closed.')) }
}
