const scope = name => `https://www.googleapis.com/auth/gmail.${name}`
const all = 'https://mail.google.com/'
export const GMAIL_API_SCOPE_GROUPS = {
  read: [scope('readonly'), scope('modify'), all],
  draftRead: [scope('readonly'), scope('compose'), scope('modify'), all],
  draft: [scope('compose'), scope('modify'), all],
  draftSend: [scope('compose'), scope('modify'), all],
  send: [scope('send'), scope('compose'), scope('modify'), all],
  labelsRead: [scope('labels'), scope('readonly'), scope('metadata'), scope('modify'), all],
  labelsWrite: [scope('labels'), scope('modify'), all],
  modify: [scope('modify'), all],
  profile: [scope('readonly'), scope('compose'), scope('metadata'), scope('modify'), all],
}
export function gmailCapabilityGranted(scopes, capability) {
  const granted = new Set(scopes)
  return capability === 'permissions' || GMAIL_API_SCOPE_GROUPS[capability]?.some(value => granted.has(value)) === true
}
const str = (description, maxLength = 4096) => ({ type: 'string', description, minLength: 1, maxLength })
const id = { ...str('Gmail API ID, not the RFC Message-ID header.', 256), pattern: '^[A-Za-z0-9_-]+$' }
const attachmentId = { ...str('Opaque Gmail attachment ID from the message.', 4096), pattern: '^[A-Za-z0-9_+=/-]+$' }
const strings = item => ({ type: 'array', items: item, maxItems: 100 })
const page = {
  query: { type: 'string', description: 'Gmail search query, such as in:inbox newer_than:7d.', maxLength: 4096 },
  pageSize: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum results; default 10. Follow nextPageToken for more.' },
  pageToken: str('Pagination token from the previous result.', 4096),
  includeSpamTrash: { type: 'boolean' },
}
const view = { type: 'string', enum: ['THREAD_VIEW_MINIMAL', 'THREAD_VIEW_FULL'], description: 'Minimal IDs/snippets by default; FULL reads content.' }
const messageRead = {
  messageFormat: { type: 'string', enum: ['PLAIN_TEXT', 'FULL_CONTENT'], description: 'PLAIN_TEXT by default; FULL_CONTENT also returns bounded HTML. HTML is never executed.' },
  bodyOffset: { type: 'integer', minimum: 0, maximum: 8_000_000, description: 'Character offset for body pagination; default 0.' },
  bodyLimit: { type: 'integer', minimum: 1, maximum: 32_000, description: 'Maximum characters per body field; default 16,000. Check bodyView for truncation and next offsets.' },
}
const compose = {
  to: strings(str('Recipient email address, optionally Name <address@example.com>.', 320)),
  cc: strings(str('CC recipient.', 320)), bcc: strings(str('BCC recipient.', 320)),
  subject: { type: 'string', maxLength: 998 },
  body: { type: 'string', description: 'Plain-text email body.', maxLength: 2_000_000 },
  htmlBody: { type: 'string', description: 'Optional HTML alternative; it is never executed by Zyra.', maxLength: 2_000_000 },
  replyToMessageId: id,
  attachments: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['filename', 'mimeType', 'data'], properties: {
    filename: str('Attachment filename, not a local path.', 255), mimeType: str('MIME media type.', 100),
    data: str('Base64 or base64url file content. Never supply a local path.', 8_000_000),
  } } },
}
function tool(name, description, capability, properties = {}, required = [], { write = false, destructive = false, idempotent = !write } = {}) {
  return {
    name, description, capability,
    inputSchema: { type: 'object', additionalProperties: false, properties, required },
    annotations: { readOnlyHint: !write, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: true },
  }
}
export const GMAIL_API_TOOLS = [
  tool('get_permissions', 'Report the actual Google-granted Gmail capabilities. Account consent does not override Zyra chat permissions.', 'permissions'),
  tool('get_profile', 'Get the authenticated Gmail account profile and mailbox counts.', 'profile'),
  tool('search_threads', 'Search Gmail threads, including recent inbox mail. Returns IDs, key headers, snippets, pagination and (only with FULL view) bounded message content.', 'read', { ...page, view }),
  tool('search_messages', 'Search Gmail messages. Returns message IDs and thread IDs, with pagination. Use get_message to read content.', 'read', page),
  tool('get_thread', 'Read a Gmail thread and its messages. Attachments with attachmentId need get_attachment.', 'read', { threadId: id, view, ...messageRead }, ['threadId']),
  tool('get_message', 'Read a Gmail message, headers and decoded text/HTML MIME bodies; HTML is data, never executable.', 'read', { messageId: id, ...messageRead }, ['messageId']),
  tool('get_attachment', 'Read a specific message attachment as base64url data. No local file is opened or written.', 'read', { messageId: id, attachmentId }, ['messageId', 'attachmentId']),
  tool('list_drafts', 'List existing Gmail drafts with pagination.', 'draftRead', page),
  tool('get_draft', 'Read an existing Gmail draft and its bounded message body.', 'draftRead', { draftId: id, ...messageRead }, ['draftId']),
  tool('create_draft', 'Create a Gmail draft without sending. A replyToMessageId also requires granted read access. Attachments upload content to Google.', 'draft', compose, [], { write: true }),
  tool('update_draft', 'Replace an existing Gmail draft without sending. Specify the complete recipients, subject, body and attachments to keep; omitted fields are not preserved.', 'draft', { draftId: id, ...compose }, ['draftId'], { write: true, idempotent: true }),
  tool('delete_draft', 'Delete an unsent Gmail draft. Does not send email.', 'draft', { draftId: id }, ['draftId'], { write: true, destructive: true, idempotent: true }),
  tool('send_draft', 'Send the existing Gmail draft to its saved To/Cc/Bcc recipients. Consequential external message; never retry automatically after an uncertain result.', 'draftSend', { draftId: id }, ['draftId'], { write: true }),
  tool('send_message', 'Send a new email to To/Cc/Bcc recipients. Consequential external message; never retry automatically after an uncertain result. replyToMessageId also requires read access.', 'send', compose, ['to'], { write: true }),
  tool('list_labels', 'List Gmail system and user labels.', 'labelsRead'),
  tool('create_label', 'Create a Gmail user label.', 'labelsWrite', { name: str('User-label name.', 225) }, ['name'], { write: true }),
  tool('update_label', 'Rename a Gmail user label. System labels cannot be renamed.', 'labelsWrite', { labelId: id, name: str('New user-label name.', 225) }, ['labelId', 'name'], { write: true, idempotent: true }),
  tool('delete_label', 'Delete a Gmail user label and remove its association with messages. Does not delete messages.', 'labelsWrite', { labelId: id }, ['labelId'], { write: true, destructive: true, idempotent: true }),
  tool('update_message_labels', 'Add/remove labels on a message. For read state use UNREAD; for starring use STARRED; for archiving remove INBOX. Use trash_message for TRASH, and mark_message_spam for SPAM.', 'modify', { messageId: id, addLabelIds: strings(id), removeLabelIds: strings(id) }, ['messageId'], { write: true, idempotent: true }),
  tool('update_thread_labels', 'Add/remove labels on all messages in a thread. Archive by removing INBOX; change read state via UNREAD and stars via STARRED.', 'modify', { threadId: id, addLabelIds: strings(id), removeLabelIds: strings(id) }, ['threadId'], { write: true, idempotent: true }),
  ...['message', 'thread'].flatMap(kind => [
    tool(`trash_${kind}`, `Move a Gmail ${kind} to Trash. Reversible; does not permanently delete mail.`, 'modify', { [`${kind}Id`]: id }, [`${kind}Id`], { write: true, destructive: true, idempotent: true }),
    tool(`untrash_${kind}`, `Restore a Gmail ${kind} from Trash.`, 'modify', { [`${kind}Id`]: id }, [`${kind}Id`], { write: true, idempotent: true }),
    tool(`mark_${kind}_spam`, `Mark a Gmail ${kind} as spam and remove it from Inbox.`, 'modify', { [`${kind}Id`]: id }, [`${kind}Id`], { write: true, idempotent: true }),
    tool(`unmark_${kind}_spam`, `Remove the spam label from a Gmail ${kind}; does not move it to Inbox automatically.`, 'modify', { [`${kind}Id`]: id }, [`${kind}Id`], { write: true, idempotent: true }),
  ]),
]
// Validate again at the execution boundary, not only the model's advertised schema.
export function validateGmailArguments(schema, value, field = 'arguments') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`)
    for (const name of schema.required || []) if (!Object.hasOwn(value, name)) throw new Error(`${field}.${name} is required.`)
    for (const [name, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, name)) throw new Error(`${field} contains an unsupported field.`)
      validateGmailArguments(schema.properties[name], item, `${field}.${name}`)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems) throw new Error(`${field} must be a bounded array.`)
    for (const item of value) validateGmailArguments(schema.items, item, field)
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > schema.maxLength || schema.enum && !schema.enum.includes(value) || schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) throw new Error(`${field} has an invalid string value.`)
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error(`${field} is out of range.`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${field} must be boolean.`)
}
