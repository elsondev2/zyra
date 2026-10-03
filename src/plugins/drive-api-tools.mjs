const scope = name => `https://www.googleapis.com/auth/${name}`
export const DRIVE_API_SCOPE_GROUPS = {
  read: [scope('drive.readonly'), scope('drive'), scope('drive.file')],
  write: [scope('drive'), scope('drive.file')],
}
export function driveCapabilityGranted(scopes, capability) {
  const granted = new Set(Array.isArray(scopes) ? scopes : [])
  return capability === 'permissions' || DRIVE_API_SCOPE_GROUPS[capability]?.some(item => granted.has(item)) === true
}
export function driveAccessCoverage(scopes) {
  const granted = new Set(Array.isArray(scopes) ? scopes : [])
  return {
    readAccess: granted.has(scope('drive')) || granted.has(scope('drive.readonly')) ? 'all-files' : granted.has(scope('drive.file')) ? 'app-accessible-files' : 'none',
    writeAccess: granted.has(scope('drive')) ? 'all-files' : granted.has(scope('drive.file')) ? 'app-accessible-files' : 'none',
  }
}
export const DRIVE_DOWNLOAD_MIME_TYPES = [
  'text/plain', 'text/csv', 'text/tab-separated-values', 'text/html', 'application/json',
  'application/pdf', 'application/octet-stream', 'application/zip',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
export const DRIVE_EXPORT_MIME_TYPES = {
  'application/vnd.google-apps.document': ['text/plain', 'text/html', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'application/vnd.google-apps.spreadsheet': ['text/csv', 'text/tab-separated-values', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'application/vnd.google-apps.presentation': ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'application/vnd.google-apps.drawing': ['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml'],
}
const str = (description, maxLength = 4096) => ({ type: 'string', description, minLength: 1, maxLength })
const id = { ...str('Opaque Google Drive API ID, never a URL or local path.', 256), pattern: '^[A-Za-z0-9_-]+$' }
const filename = { ...str('Drive file name only, never a local path.', 255), pattern: '^(?!\\.{1,2}$)[^\\x00-\\x1f\\x7f/\\\\:]+$' }
const description = { type: 'string', maxLength: 4096, description: 'Description text; an omitted description is preserved on update.' }
const parents = { type: 'array', items: id, maxItems: 1, minItems: 1, description: 'One explicit destination folder ID; no local paths.' }
const page = {
  pageSize: { type: 'integer', minimum: 1, maximum: 50, description: 'One bounded page; default 10. Follow nextPageToken explicitly.' },
  pageToken: { ...str('Opaque nextPageToken from the previous result.', 4096), pattern: '^[^\\x00-\\x20\\x7f]+$' },
}
const format = { type: 'string', enum: ['text', 'base64'], maxLength: 6, description: 'Default base64. Text is allowed only for supported textual MIME types; HTML/SVG remains inert text.' }
const mime = { type: 'string', enum: DRIVE_DOWNLOAD_MIME_TYPES, maxLength: 150, description: 'An explicitly supported MIME type.' }
const content = { type: 'object', additionalProperties: false, required: ['mimeType', 'encoding', 'data'], properties: {
  mimeType: mime,
  encoding: { type: 'string', enum: ['text', 'base64'], maxLength: 6 },
  data: { type: 'string', maxLength: 48 * 1024, description: 'Inline bounded UTF-8 text or canonical base64 content. Never a local file path; no file is opened.' },
} }
function tool(name, description, capability, properties = {}, required = [], { write = false, destructive = false, idempotent = !write } = {}) {
  return { name, description, capability, inputSchema: { type: 'object', additionalProperties: false, properties, required },
    annotations: { readOnlyHint: !write, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: true } }
}
export const DRIVE_API_TOOLS = [
  tool('get_permissions', 'Report actual Google-granted Drive scopes and all-file versus app-accessible-file coverage. Zyra chat permissions still apply.', 'permissions'),
  tool('search_files', 'Search one bounded Google Drive q page with fixed metadata fields; never downloads file content. Google enforces file access.', 'read', { ...page, query: { type: 'string', maxLength: 4096, description: 'Drive q syntax, e.g. trashed = false. No arbitrary URL or fields parameter.' } }),
  tool('get_file', 'Read fixed Drive file metadata, including capabilities; no external download links are followed.', 'read', { fileId: id }, ['fileId']),
  tool('read_file', 'Read supported file content, at most 128 KiB, as base64 or inert text. Workspace documents require explicit exportMimeType and use files.export.', 'read', { fileId: id, format, exportMimeType: mime }, ['fileId']),
  tool('export_file', 'Export a supported Workspace document using an explicit MIME type, at most 128 KiB. HTML/SVG is inert data; spreadsheets CSV/TSV export only the first sheet.', 'read', { fileId: id, mimeType: mime, format }, ['fileId', 'mimeType']),
  tool('create_file', 'Create a Drive folder (explicit folder mimeType) or upload bounded inline content. No filesystem access or Workspace conversion.', 'write', { name: filename, description, parents, mimeType: { type: 'string', enum: ['application/vnd.google-apps.folder'], maxLength: 150 }, content }, ['name'], { write: true }),
  tool('update_file', 'Patch only explicit name/description or replace explicit inline file content; omitted metadata stays unchanged. No parent moves or Workspace content replacement. Uses If-Match when an ETag is available.', 'write', { fileId: id, name: filename, description, content, etag: { ...str('Optional exact ETag for optimistic concurrency.', 512), pattern: '^(?:W/)?"[\\x21\\x23-\\x7e]+"$' } }, ['fileId'], { write: true, idempotent: true }),
  tool('copy_file', 'Copy one Drive file, optionally with explicit name or destination folder. This creates a new file; do not retry uncertain results.', 'write', { fileId: id, name: filename, description, parents }, ['fileId'], { write: true }),
  tool('trash_file', 'Move a Drive file to Trash, reversibly. Never permanently deletes a file.', 'write', { fileId: id }, ['fileId'], { write: true, destructive: true, idempotent: true }),
  tool('untrash_file', 'Restore a Drive file from Trash.', 'write', { fileId: id }, ['fileId'], { write: true, idempotent: true }),
  tool('list_permissions', 'List one bounded page of Drive sharing permissions; Google enforces access to the file.', 'read', { fileId: id, ...page }, ['fileId']),
  tool('create_permission', 'Share a file with one explicit user/group email as reader/commenter/writer and notify them. No public/domain shares, ownership transfer, permission deletion or permission updates.', 'write', { fileId: id, type: { type: 'string', enum: ['user', 'group'], maxLength: 5 }, role: { type: 'string', enum: ['reader', 'commenter', 'writer'], maxLength: 9 }, emailAddress: { ...str('Explicit user or group email address.', 254), pattern: '^[A-Za-z0-9.!#$%&\u0027*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,63}$' } }, ['fileId', 'type', 'role', 'emailAddress'], { write: true }),
]
// Advertised schema is validated again at execution, without an SDK dependency.
export function validateDriveArguments(schema, value, field = 'arguments') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${field} must be a plain object.`)
    for (const name of schema.required || []) if (!Object.hasOwn(value, name)) throw new Error(`${field}.${name} is required.`)
    for (const [name, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, name)) throw new Error(`${field} contains an unsupported field.`)
      validateDriveArguments(schema.properties[name], item, `${field}.${name}`)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems || value.length < (schema.minItems || 0)) throw new Error(`${field} must be a bounded array.`)
    for (const item of value) validateDriveArguments(schema.items, item, field)
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > schema.maxLength || schema.enum && !schema.enum.includes(value) || schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) throw new Error(`${field} has an invalid string value.`)
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error(`${field} is out of range.`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${field} must be boolean.`)
}
