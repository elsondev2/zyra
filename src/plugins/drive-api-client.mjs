import { randomBytes } from 'node:crypto'
import { DRIVE_API_TOOLS, DRIVE_API_SCOPE_GROUPS, DRIVE_DOWNLOAD_MIME_TYPES, DRIVE_EXPORT_MIME_TYPES, driveCapabilityGranted, driveAccessCoverage, validateDriveArguments } from './drive-api-tools.mjs'

const ROOT = 'https://www.googleapis.com/drive/v3/'
const UPLOAD_ROOT = 'https://www.googleapis.com/upload/drive/v3/'
const MAX_INPUT_BYTES = 64 * 1024
const MAX_HTTP_BYTES = 256 * 1024
const MAX_CONTENT_BYTES = 128 * 1024
const MAX_RESULT_BYTES = 256 * 1024
class SafeDriveResponseError extends Error {}
const FILE_KEYS = ['id', 'name', 'mimeType', 'description', 'size', 'createdTime', 'modifiedTime', 'parents', 'trashed', 'capabilities']
const CAPABILITY_KEYS = ['canEdit', 'canCopy', 'canTrash', 'canUntrash', 'canShare', 'canDownload']
const FILE_FIELDS = FILE_KEYS.slice(0, -1).join(',') + `,capabilities(${CAPABILITY_KEYS.join(',')})`
const PERMISSION_KEYS = ['id', 'type', 'role', 'emailAddress', 'displayName', 'expirationTime', 'deleted']
const PERMISSION_FIELDS = PERMISSION_KEYS.join(',')
const ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u
const ETAG_PATTERN = /^(?:W\/)?"[\x21\x23-\x7e]{1,508}"$/u
const textual = mime => mime.startsWith('text/') || ['application/json', 'image/svg+xml'].includes(mime)
const select = (value, keys) => Object.fromEntries(keys.filter(key => value && Object.hasOwn(value, key)).map(key => [key, value[key]]))
function fileMetadata(value) {
  const file = select(value, FILE_KEYS)
  if (file.capabilities) file.capabilities = select(file.capabilities, CAPABILITY_KEYS)
  return file
}
function segment(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('Invalid Drive file ID.')
  return encodeURIComponent(value)
}
function cancelBody(response) { try { const cancelled = response?.body?.cancel(); cancelled?.catch(() => undefined) } catch { /* Best-effort disposal; never reveal transport errors. */ } }
function metadataPatch(args, allowParents = false) { return select(args, ['name', 'description', ...(allowParents ? ['parents'] : [])]) }
function inlineContent(content) {
  let bytes
  if (content.encoding === 'base64') {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(content.data)) throw new Error('Drive content must be canonical base64.')
    bytes = Buffer.from(content.data, 'base64')
    if (bytes.toString('base64') !== content.data) throw new Error('Drive content must be canonical base64.')
  } else {
    if (!textual(content.mimeType)) throw new Error('Text uploads require a supported textual MIME type; use base64 for binary content.')
    bytes = Buffer.from(content.data, 'utf8')
  }
  if (bytes.length > 48 * 1024) throw new Error('Drive upload exceeds the inline content size limit.')
  return bytes
}
function multipart(metadata, content, bytes) {
  const boundary = `zyra_drive_${randomBytes(18).toString('hex')}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${content.mimeType}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  if (body.length > MAX_INPUT_BYTES) throw new Error('Drive upload exceeds the HTTP request size limit.')
  return { body, contentType: `multipart/related; boundary=${boundary}` }
}

/** Regular Drive API adapter. Only the host can supply actual tokeninfo scopes
 * and tokens. Model arguments never control origins, credentials or headers. */
export class DriveApiClient {
  constructor({ getAccess, fetch = globalThis.fetch, onAuthorizationFailure = async () => {} }) {
    this.getAccess = getAccess
    this.fetch = fetch
    this.onAuthorizationFailure = onAuthorizationFailure
    this.controller = new AbortController()
  }
  signal(signal) { return AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]) }
  aborted() { return new Error(this.controller.signal.aborted ? 'Drive connection closed.' : 'Drive operation failed or was cancelled (including timeout).') }
  fence(signal) { if (signal?.aborted) throw this.aborted() }
  // A fence is required even when a synthetic/host transport ignores AbortSignal.
  wait(value, signal, onLate) {
    this.fence(signal)
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback, result) => {
        if (settled) return false
        settled = true
        signal?.removeEventListener('abort', abort)
        callback(result)
        return true
      }
      const abort = () => finish(reject, this.aborted())
      signal?.addEventListener('abort', abort, { once: true })
      Promise.resolve(value).then(result => {
        if (signal?.aborted) abort()
        if (!finish(resolve, result)) onLate?.(result)
      }, error => finish(reject, error))
      if (signal?.aborted) abort()
    })
  }
  async access(capability, signal, forceRefresh = false) {
    this.fence(signal)
    let access
    try { access = await this.wait(this.getAccess({ signal, forceRefresh }), signal) }
    catch { this.fence(signal); throw new Error('Drive account authorization could not be obtained. Reconnect this Google account.') }
    this.fence(signal)
    if (!access || typeof access.accessToken !== 'string' || !access.accessToken || /[\r\n]/u.test(access.accessToken) || !Array.isArray(access.scopes) || access.scopes.some(item => typeof item !== 'string')) throw new Error('Drive account authorization is unavailable. Reconnect this Google account.')
    if (!driveCapabilityGranted(access.scopes, capability)) throw new Error(`Google has not granted Drive ${capability} access. Reconnect and choose the relevant Google permission.`)
    return access
  }
  async readResponse(response, signal, limit, raw) {
    this.fence(signal)
    if (Number(response.headers.get('content-length') || 0) > limit) {
      cancelBody(response)
      throw new SafeDriveResponseError('Drive response exceeds the bounded read size limit. Choose a smaller file or page.')
    }
    const reader = response.body?.getReader()
    if (!reader) {
      if (response.status === 204) return raw ? Buffer.alloc(0) : {}
      throw new SafeDriveResponseError('Drive returned an unreadable API response.')
    }
    const chunks = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await this.wait(reader.read(), signal)
        this.fence(signal)
        if (done) break
        size += value.byteLength
        if (size > limit) throw new SafeDriveResponseError('Drive response exceeds the bounded read size limit. Choose a smaller file or page.')
        chunks.push(value)
      }
      const bytes = Buffer.concat(chunks, size)
      this.fence(signal)
      if (raw) return bytes
      try { return JSON.parse(bytes.toString('utf8')) }
      catch { throw new SafeDriveResponseError('Drive returned an invalid API response.') }
    } catch (error) {
      try { reader.cancel().catch(() => undefined) } catch { /* Preserve a redacted error. */ }
      if (signal?.aborted) throw this.aborted()
      if (error instanceof SafeDriveResponseError) throw error
      throw new SafeDriveResponseError('Drive response could not be read or was cancelled.')
    } finally { try { reader.releaseLock() } catch { /* An outstanding read may still be settling. */ } }
  }
  async request(method, path, capability, { query = {}, body, contentType, upload = false, etag, signal, raw = false, withEtag = false } = {}) {
    const activeSignal = signal || this.signal()
    this.fence(activeSignal)
    // Paths and methods are generated locally, and validated before token access.
    const regularPath = /^(?:about|files(?:\/[A-Za-z0-9_-]{1,256}(?:\/(?:export|copy|permissions))?)?)$/u
    const uploadPath = /^files(?:\/[A-Za-z0-9_-]{1,256})?$/u
    if (!['GET', 'POST', 'PATCH'].includes(method) || !(upload ? uploadPath : regularPath).test(path)) throw new Error('Invalid Drive API destination.')
    if (upload && !['POST', 'PATCH'].includes(method)) throw new Error('Invalid Drive API upload method.')
    let requiredCapability
    if (!upload && method === 'GET') requiredCapability = 'read'
    else if (method === 'POST' && path === 'files' || method === 'PATCH' && /^files\/[A-Za-z0-9_-]{1,256}$/u.test(path) || !upload && method === 'POST' && /^files\/[A-Za-z0-9_-]{1,256}\/(?:copy|permissions)$/u.test(path)) requiredCapability = 'write'
    if (!requiredCapability || capability !== requiredCapability) throw new Error('Invalid Drive API capability for this operation.')
    const url = new URL(path, upload ? UPLOAD_ROOT : ROOT)
    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith(upload ? '/upload/drive/v3/' : '/drive/v3/')) throw new Error('Invalid Drive API destination.')
    const queryKeys = new Set(['fields', 'q', 'spaces', 'pageSize', 'pageToken', 'alt', 'mimeType', 'uploadType', 'supportsAllDrives', 'sendNotificationEmail'])
    for (const [key, value] of Object.entries(query)) {
      if (!queryKeys.has(key)) throw new Error('Unsupported Drive API query parameter.')
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    if (etag !== undefined && !ETAG_PATTERN.test(etag)) throw new Error('Invalid Drive ETag.')
    const payload = body === undefined ? undefined : contentType ? body : JSON.stringify(body)
    if (payload !== undefined && Buffer.byteLength(payload) > MAX_INPUT_BYTES) throw new Error('Drive request exceeds the input size limit.')
    for (let attempt = 0; attempt < 2; attempt++) {
      const access = await this.access(capability, activeSignal, attempt === 1)
      let response
      try {
        response = await this.wait(this.fetch(url, {
          method, headers: { authorization: `Bearer ${access.accessToken}`, ...(payload === undefined ? {} : { 'content-type': contentType || 'application/json; charset=UTF-8' }), ...(etag ? { 'if-match': etag } : {}) },
          ...(payload === undefined ? {} : { body: payload }), signal: activeSignal, redirect: 'error',
        }), activeSignal, cancelBody)
        this.fence(activeSignal)
      } catch {
        if (method === 'GET') { this.fence(activeSignal); throw new Error('Drive API read failed or was cancelled.') }
        throw new Error('Drive API action failed or was cancelled. Its result may be uncertain; no automatic retry was made. Inspect Drive before retrying.')
      }
      if (response.status === 401 && attempt === 0) {
        cancelBody(response)
        // Only an explicit rejection permits one forced-refresh retry. Never
        // retry timeouts, network failures, 429, 5xx or unread accepted writes.
        continue
      }
      if (!response.ok) {
        cancelBody(response)
        if (response.status === 401 || response.status === 403) {
          try { await this.wait(this.onAuthorizationFailure(response.status), activeSignal) } catch { this.fence(activeSignal) }
        }
        if (response.status === 401) throw new Error('Google denied Drive authorization. Reconnect this account.')
        if (response.status === 403) throw new Error('Google denied this Drive operation. Check granted scopes, app-file access, sharing policy and whether the Drive API is enabled.')
        if (response.status === 404) throw new Error('Drive could not find this file or permission within the granted file access.')
        if (response.status === 412) throw new Error('Drive rejected this action because the file changed. Read the file again before making a new explicit update.')
        throw new Error(`Drive API rejected this request (HTTP ${response.status}).${method !== 'GET' && response.status >= 500 ? ' The action result may be uncertain; no automatic retry was made. Inspect Drive before retrying.' : ''}`)
      }
      try {
        if (response.redirected || response.url && (new URL(response.url).origin !== url.origin || new URL(response.url).pathname !== url.pathname)) {
          cancelBody(response)
          throw new SafeDriveResponseError('Drive returned an unexpected API destination.')
        }
        const data = await this.readResponse(response, activeSignal, raw ? MAX_CONTENT_BYTES : MAX_HTTP_BYTES, raw)
        this.fence(activeSignal)
        if (!raw && (!data || typeof data !== 'object' || Array.isArray(data))) throw new SafeDriveResponseError('Drive returned an invalid API response.')
        const responseEtag = response.headers.get('etag')
        return withEtag ? { data, etag: responseEtag && ETAG_PATTERN.test(responseEtag) ? responseEtag : undefined } : data
      } catch (error) {
        if (method !== 'GET') throw new Error('Google accepted this Drive action, but its response could not be read or exceeded the read limit. Do not repeat it blindly; inspect Drive before retrying.')
        if (activeSignal.aborted) throw this.aborted()
        if (error instanceof SafeDriveResponseError) throw error
        throw new Error('Drive returned an invalid API response.')
      }
    }
    throw new Error('Google denied Drive authorization. Reconnect this account.')
  }
  async verifyAccount({ signal } = {}) {
    const activeSignal = this.signal(signal)
    await this.request('GET', 'about', 'read', { signal: activeSignal, query: { fields: 'user(displayName,emailAddress)' } })
    return { toolCount: (await this.listTools(undefined, { signal: activeSignal })).tools.length }
  }
  async listTools(_params, { signal } = {}) {
    const { scopes } = await this.access('permissions', this.signal(signal))
    const coverage = driveAccessCoverage(scopes)
    return { tools: DRIVE_API_TOOLS.filter(tool => driveCapabilityGranted(scopes, tool.capability)).map(({ capability, ...tool }) => ({ ...tool,
      description: `${tool.description}${capability === 'permissions' ? '' : ` Current ${capability} access: ${coverage[capability === 'write' ? 'writeAccess' : 'readAccess']}; Google enforces file access.`}`,
    })) }
  }
  async callTool({ name, arguments: args = {} }, { signal } = {}) {
    const tool = DRIVE_API_TOOLS.find(item => item.name === name)
    if (!tool) throw new Error('Unknown Drive API tool.')
    let input
    try { input = JSON.stringify(args) } catch { throw new Error('Drive arguments must be a bounded JSON object.') }
    if (input === undefined || Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new Error('Drive arguments exceed the input size limit (64 KiB).')
    validateDriveArguments(tool.inputSchema, args)
    const activeSignal = this.signal(signal)
    const { scopes } = await this.access(tool.capability, activeSignal)
    const request = (method, path, options = {}, capability = tool.capability) => this.request(method, path, capability, { ...options, signal: activeSignal })
    const filePath = args.fileId ? `files/${segment(args.fileId)}` : undefined
    const getMetadata = () => request('GET', filePath, { query: { fields: FILE_FIELDS, supportsAllDrives: true }, withEtag: true }, 'read')
    const pageQuery = { pageSize: args.pageSize || 10, pageToken: args.pageToken }
    let result
    if (name === 'get_permissions') result = {
      backend: 'drive-api', grantedScopes: scopes, capabilities: Object.fromEntries(Object.keys(DRIVE_API_SCOPE_GROUPS).map(key => [key, driveCapabilityGranted(scopes, key)])),
      ...driveAccessCoverage(scopes), googleEnforcesFileAccess: true, chatPermissionsStillApply: true,
      permanentDeletionAvailable: false, ownershipChangesAvailable: false, publicSharingAvailable: false,
      sharingAvailable: driveCapabilityGranted(scopes, 'write'), sharingRestrictions: 'Only explicit user/group emails as reader/commenter/writer; notifications are sent. Same write file-access limit applies.',
    }
    else if (name === 'search_files') {
      const data = await request('GET', 'files', { query: { ...pageQuery, q: args.query, spaces: 'drive', fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})` } })
      if (data.files !== undefined && !Array.isArray(data.files)) throw new Error('Drive returned an invalid file page.')
      result = { ...select(data, ['nextPageToken', 'incompleteSearch']), files: (data.files || []).map(fileMetadata) }
    } else if (name === 'get_file') {
      const metadata = await getMetadata()
      result = { ...fileMetadata(metadata.data), ...(metadata.etag ? { etag: metadata.etag } : {}) }
    } else if (name === 'read_file' || name === 'export_file') {
      const { data: metadata } = await getMetadata()
      const workspace = typeof metadata.mimeType === 'string' && metadata.mimeType.startsWith('application/vnd.google-apps.')
      let outputMime = metadata.mimeType
      let path = filePath
      let query = { alt: 'media', supportsAllDrives: true }
      if (workspace || name === 'export_file') {
        outputMime = name === 'export_file' ? args.mimeType : args.exportMimeType
        if (!outputMime) throw new Error('Workspace file reads require an explicit exportMimeType. Use export_file for a supported export.')
        if (!DRIVE_EXPORT_MIME_TYPES[metadata.mimeType]?.includes(outputMime)) throw new Error('This Workspace file and MIME type are not a supported export.')
        path += '/export'
        query = { mimeType: outputMime }
      } else {
        if (args.exportMimeType) throw new Error('exportMimeType applies only to supported Workspace files.')
        if (!DRIVE_DOWNLOAD_MIME_TYPES.includes(outputMime)) throw new Error('This file MIME type is not supported for bounded content reads.')
      }
      const format = args.format || 'base64'
      if (format === 'text' && !textual(outputMime)) throw new Error('Text reads require a supported textual MIME type; use base64 for binary content.')
      const bytes = await request('GET', path, { query, raw: true })
      let text
      if (format === 'text') {
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
        catch { throw new Error('Drive content is not valid UTF-8 text. Read it explicitly as base64 instead.') }
      }
      result = { fileId: args.fileId, mimeType: outputMime, encoding: format, size: bytes.length, contentIsInert: true, ...(format === 'text' ? { text } : { data: bytes.toString('base64') }) }
    } else if (name === 'create_file') {
      if (Boolean(args.content) === Boolean(args.mimeType)) throw new Error('Create requires either explicit folder mimeType or content, never both.')
      const metadata = metadataPatch(args, true)
      if (args.content) {
        const bytes = inlineContent(args.content)
        result = fileMetadata(await request('POST', 'files', { upload: true, ...multipart({ ...metadata, mimeType: args.content.mimeType }, args.content, bytes), query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: true } }))
      } else result = fileMetadata(await request('POST', 'files', { body: { ...metadata, mimeType: args.mimeType }, query: { fields: FILE_FIELDS, supportsAllDrives: true } }))
    } else if (name === 'update_file' || name === 'trash_file' || name === 'untrash_file') {
      const metadata = name === 'update_file' ? metadataPatch(args) : { trashed: name === 'trash_file' }
      if (!Object.keys(metadata).length && !args.content) throw new Error('Choose at least one explicit metadata field or content update.')
      const bytes = args.content ? inlineContent(args.content) : undefined
      const original = await getMetadata()
      if (args.content && original.data.mimeType !== args.content.mimeType) throw new Error('Content updates require the existing supported non-Workspace MIME type; MIME conversion is unavailable.')
      const etag = args.etag || original.etag
      const data = await request('PATCH', filePath, { ...(args.content ? { upload: true, ...multipart(metadata, args.content, bytes) } : { body: metadata }), etag,
        query: { ...(args.content ? { uploadType: 'multipart' } : {}), fields: FILE_FIELDS, supportsAllDrives: true } })
      result = { ...fileMetadata(data), ...(!etag ? { warnings: ['Google supplied no usable ETag; this update could not be protected against concurrent changes.'] } : {}) }
    } else if (name === 'copy_file') result = fileMetadata(await request('POST', `${filePath}/copy`, { body: metadataPatch(args, true), query: { fields: FILE_FIELDS, supportsAllDrives: true } }))
    else if (name === 'list_permissions') {
      const data = await request('GET', `${filePath}/permissions`, { query: { ...pageQuery, fields: `nextPageToken,permissions(${PERMISSION_FIELDS})`, supportsAllDrives: true } })
      if (data.permissions !== undefined && !Array.isArray(data.permissions)) throw new Error('Drive returned an invalid permissions page.')
      result = { ...select(data, ['nextPageToken']), permissions: (data.permissions || []).map(item => select(item, PERMISSION_KEYS)) }
    } else if (name === 'create_permission') result = select(await request('POST', `${filePath}/permissions`, { body: select(args, ['type', 'role', 'emailAddress']), query: { fields: PERMISSION_FIELDS, supportsAllDrives: true, sendNotificationEmail: true } }), PERMISSION_KEYS)
    else throw new Error('Unknown Drive API tool.')
    if (activeSignal.aborted && !tool.annotations.readOnlyHint) throw new Error('Google accepted this Drive action, but displaying its result was cancelled. Do not repeat it blindly; inspect Drive before retrying.')
    this.fence(activeSignal)
    const response = { content: [{ type: 'text', text: JSON.stringify(result) }] }
    if (Buffer.byteLength(JSON.stringify(response)) > MAX_RESULT_BYTES) throw new Error(tool.annotations.readOnlyHint ? 'Drive result exceeds the tool display limit. Choose a smaller file or page.' : 'Google accepted this Drive action, but its result exceeds the display limit. Do not repeat it blindly; inspect Drive before retrying.')
    return response
  }
  async close() { this.controller.abort() }
}
