import { randomBytes } from 'node:crypto'
const CRLF = '\r\n'
function header(value) {
  const result = String(value ?? '')
  if (/[\x00-\x1f\x7f]/u.test(result)) throw new Error('Email headers must not contain control characters or line breaks.')
  return result
}
function encodedHeader(value, force = false) {
  const text = header(value)
  if (!force && /^[\x20-\x7e]*$/u.test(text)) return text
  const chunks = []
  let chunk = ''
  for (const character of text) {
    if (Buffer.byteLength(chunk + character) > 42) { chunks.push(chunk); chunk = '' }
    chunk += character
  }
  if (chunk) chunks.push(chunk)
  return chunks.map(value => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`).join(`${CRLF} `)
}
const mailbox = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/u
export function gmailAddress(value) {
  const text = header(value).trim()
  const named = /^(.*?)\s*<([^<>]+)>$/u.exec(text)
  const address = named ? named[2].trim() : text
  if (!mailbox.test(address)) throw new Error('Use a valid email address in each recipient entry.')
  if (!named || !named[1].trim()) return address
  const name = named[1].trim().replace(/^"(.*)"$/u, '$1')
  return `${encodedHeader(name, true)} <${address}>`
}
export function decodeGmailHeader(value = '') {
  return String(value).replace(/(\?=)[ \t\r\n]+(?==\?)/gu, '$1').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/giu, (whole, charset, kind, content) => {
    try {
      const bytes = kind.toLowerCase() === 'b' ? Buffer.from(content, 'base64') : Buffer.from(content.replace(/_/gu, ' ').replace(/=([a-f\d]{2})/giu, (_m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1')
      return new TextDecoder(charset).decode(bytes)
    } catch { return whole }
  })
}
export function gmailHeader(message, name) {
  return message?.payload?.headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || ''
}
function wrappedBase64(bytes) { return Buffer.from(bytes).toString('base64').match(/.{1,76}/gu)?.join(CRLF) || '' }
export function decodeAttachmentData(value) {
  if (typeof value !== 'string' || !/^[A-Za-z\d+/_-]*={0,2}$/u.test(value) || value.replace(/=+$/u, '').length % 4 === 1) throw new Error('Attachment data must be valid base64 or base64url, without whitespace.')
  const data = Buffer.from(value, 'base64url')
  if (data.toString('base64url') !== value.replace(/=+$/u, '').replace(/\+/gu, '-').replace(/\//gu, '_')) throw new Error('Attachment data must be canonical base64 or base64url.')
  return data
}
function textPart(type, text) {
  return [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrappedBase64(Buffer.from(text))].join(CRLF)
}
function multipart(type, parts) {
  const boundary = `zyra_${randomBytes(18).toString('hex')}`
  return [`Content-Type: multipart/${type}; boundary="${boundary}"`, '', ...parts.flatMap(part => [`--${boundary}`, part]), `--${boundary}--`, ''].join(CRLF)
}
export function composeGmailMessage(args, reply) {
  const recipients = {}
  for (const key of ['to', 'cc', 'bcc']) recipients[key] = (args[key] || []).map(gmailAddress)
  const headers = []
  for (const key of ['to', 'cc', 'bcc']) if (recipients[key].length) headers.push(`${key === 'to' ? 'To' : key === 'cc' ? 'Cc' : 'Bcc'}: ${recipients[key].join(`,${CRLF} `)}`)
  let subject = args.subject ?? ''
  if (reply) {
    const messageId = header(gmailHeader(reply, 'Message-ID')).trim()
    if (!/^<[^<>\s]+>$/u.test(messageId)) throw new Error('The original email has no valid Message-ID for a threaded reply.')
    const originalSubject = decodeGmailHeader(gmailHeader(reply, 'Subject'))
    const normalized = value => value.replace(/^(?:re:\s*)+/giu, '').trim()
    if (args.subject !== undefined && normalized(args.subject) !== normalized(originalSubject)) throw new Error('A threaded reply must retain the original subject.')
    subject = args.subject ?? (/^re:/iu.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`)
    const references = (header(gmailHeader(reply, 'References')).match(/<[^<>\s]+>/gu) || []).slice(-30)
    if (!references.includes(messageId)) references.push(messageId)
    headers.push(`In-Reply-To: ${messageId}`, `References: ${references.join(' ')}`)
  }
  headers.push(`Subject: ${encodedHeader(subject)}`, 'MIME-Version: 1.0')
  let body = textPart('text/plain', args.body || '')
  if (args.htmlBody !== undefined) body = multipart('alternative', [body, textPart('text/html', args.htmlBody)])
  let attachmentBytes = 0
  const attachments = (args.attachments || []).map(item => {
    const filename = header(item.filename)
    const type = header(item.mimeType)
    if (!/^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/iu.test(type)) throw new Error('Attachment MIME type is invalid.')
    const bytes = decodeAttachmentData(item.data)
    attachmentBytes += bytes.length
    if (attachmentBytes > 24 * 1024 * 1024) throw new Error('Combined attachment content exceeds the Gmail adapter size limit.')
    const fallback = filename.replace(/[^a-z\d_. -]/giu, '_') || 'attachment'
    const encoded = encodeURIComponent(filename).replace(/['()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    return [`Content-Type: ${type}`, `Content-Disposition: attachment; filename="${fallback}";`, ` filename*=UTF-8''${encoded}`, 'Content-Transfer-Encoding: base64', '', wrappedBase64(bytes)].join(CRLF)
  })
  if (attachments.length) body = multipart('mixed', [body, ...attachments])
  const rawBytes = Buffer.from([...headers, body].join(CRLF))
  if (rawBytes.length > 35 * 1024 * 1024) throw new Error('Composed email exceeds the Gmail adapter size limit.')
  return { raw: rawBytes.toString('base64url'), ...(reply?.threadId ? { threadId: reply.threadId } : {}) }
}
function htmlText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<\/?(?:br|p|div|tr|li|h[1-6]|blockquote)\b[^>]*>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (whole, name) => {
      if (!name.startsWith('#')) return entities[name.toLowerCase()] || whole
      const number = name.toLowerCase().startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : whole
    }).replace(/[ \t]+/gu, ' ').replace(/\n\s*\n/gu, '\n\n').trim()
}
export function readableGmailMessage(message, { messageFormat = 'PLAIN_TEXT', bodyOffset = 0, bodyLimit = 16_000 } = {}) {
  if (!message || typeof message !== 'object') return message
  const text = [], html = [], attachments = []
  const walk = part => {
    if (!part) return
    const attachment = part.filename || part.body?.attachmentId
    if (attachment) attachments.push({ filename: part.filename || '', mimeType: part.mimeType, size: part.body?.size, attachmentId: part.body?.attachmentId, partId: part.partId })
    if (!part.filename && part.body?.data && ['text/plain', 'text/html'].includes(part.mimeType)) {
      const charset = /charset\s*=\s*["']?([^;\s"']+)/iu.exec(part.headers?.find(item => item.name?.toLowerCase() === 'content-type')?.value || '')?.[1] || 'utf-8'
      const bytes = Buffer.from(part.body.data, 'base64url')
      let decoded
      try { decoded = new TextDecoder(charset).decode(bytes) } catch { decoded = bytes.toString('utf8') }
      ;(part.mimeType === 'text/plain' ? text : html).push(decoded)
    }
    for (const child of part.parts || []) walk(child)
  }
  walk(message.payload)
  const htmlBody = html.join('\n')
  const textBody = text.join('\n') || htmlText(htmlBody)
  const nextOffset = bodyOffset + bodyLimit
  return {
    id: message.id, threadId: message.threadId, labelIds: message.labelIds,
    snippet: message.snippet, historyId: message.historyId, internalDate: message.internalDate,
    sizeEstimate: message.sizeEstimate,
    headers: (message.payload?.headers || []).map(item => ({ name: item.name, value: decodeGmailHeader(item.value) })),
    text: textBody.slice(bodyOffset, nextOffset),
    ...(messageFormat === 'FULL_CONTENT' ? { html: htmlBody.slice(bodyOffset, nextOffset) } : {}),
    ...(text.length === 0 && htmlBody ? { textSource: 'html-derived' } : {}),
    bodyView: { offset: bodyOffset, limit: bodyLimit, textTotalCharacters: textBody.length, htmlTotalCharacters: htmlBody.length,
      ...(textBody.length > nextOffset ? { nextTextOffset: nextOffset } : {}),
      ...(messageFormat === 'FULL_CONTENT' && htmlBody.length > nextOffset ? { nextHtmlOffset: nextOffset } : {}),
    }, attachments,
  }
}
