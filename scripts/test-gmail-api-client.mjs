import assert from 'node:assert/strict'
import { GmailApiClient } from '../src/plugins/gmail-api-client.mjs'
import { GMAIL_API_TOOLS } from '../src/plugins/gmail-api-tools.mjs'
import { composeGmailMessage, decodeGmailHeader, readableGmailMessage } from '../src/plugins/gmail-api-mime.mjs'
const scope = name => `https://www.googleapis.com/auth/gmail.${name}`
let scopes = [scope('readonly')]
const calls = []
const original = { id: 'm1', threadId: 't1', labelIds: ['INBOX'], payload: { mimeType: 'multipart/alternative', headers: [{ name: 'Subject', value: 'Hello' }, { name: 'Message-ID', value: '<original@example.test>' }], parts: [
  { mimeType: 'text/plain', body: { data: Buffer.from('Read this email.').toString('base64url') } },
  { mimeType: 'text/html', body: { data: Buffer.from('<p>Read this email.</p>').toString('base64url') } },
  { filename: 'report.pdf', mimeType: 'application/pdf', body: { size: 4, attachmentId: 'a1' } },
] } }
const getAccess = async ({ signal } = {}) => { signal?.throwIfAborted(); return { accessToken: 'synthetic-host-access-token', scopes } }
const client = new GmailApiClient({ getAccess, fetch: async (url, init) => {
  assert.equal(url.origin, 'https://gmail.googleapis.com')
  assert.equal(init.headers.authorization, 'Bearer synthetic-host-access-token')
  assert.equal(init.redirect, 'error')
  const path = url.pathname.replace('/gmail/v1/users/me/', '')
  calls.push({ path, method: init.method, body: init.body && JSON.parse(init.body), query: Object.fromEntries(url.searchParams) })
  if (path === 'profile') return Response.json({ emailAddress: 'user@example.test', messagesTotal: 3 })
  if (path === 'threads') return Response.json({ threads: [{ id: 't1' }], nextPageToken: 'next-page' })
  if (path.startsWith('threads/')) return Response.json({ id: 't1', messages: [original] })
  if (path === 'messages') return Response.json({ messages: [{ id: 'm1', threadId: 't1' }], nextPageToken: 'next-page' })
  if (path.includes('/attachments/')) return Response.json({ size: 4, data: 'ZmlsZQ' })
  if (path === 'drafts' && init.method === 'GET') return Response.json({ drafts: [{ id: 'd1', message: { id: 'm1' } }] })
  if (path === 'drafts/send' || path === 'messages/send') return Response.json({ id: 'sent1', threadId: 't1' })
  if (path.startsWith('drafts') && init.method !== 'DELETE') return Response.json({ id: 'd1', message: original })
  if (path === 'labels' && init.method === 'GET') return Response.json({ labels: [{ id: 'Label_1', name: 'Saved', type: 'user' }] })
  if (path.startsWith('labels') && init.method !== 'DELETE') return Response.json({ id: 'Label_1', name: 'Saved', type: 'user' })
  if (init.method === 'DELETE') return new Response(null, { status: 204 })
  return Response.json(original)
} })
const run = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text)
try {
  const readTools = (await client.listTools()).tools.map(tool => tool.name)
  assert.ok(readTools.includes('get_message') && readTools.includes('get_draft'))
  assert.ok(!readTools.includes('send_message') && !readTools.includes('create_draft') && !readTools.includes('trash_message'))
  const before = calls.length
  await assert.rejects(() => run('send_message', { to: ['recipient@example.test'], body: 'no' }), /not granted/u)
  await assert.rejects(() => run('create_draft', {}), /not granted/u)
  assert.equal(calls.length, before, 'missing grants fail before mailbox requests')
  assert.equal((await client.verifyAccount()).toolCount, readTools.length)
  const search = await run('search_threads', { query: 'in:inbox', pageSize: 2 })
  assert.equal(search.nextPageToken, 'next-page')
  assert.equal(search.threads[0].messages[0].id, 'm1')
  assert.equal(search.threads[0].messages[0].text, undefined, 'minimal discovery does not accidentally read bodies')
  assert.deepEqual(calls.find(item => item.path === 'threads').query, { q: 'in:inbox', maxResults: '2' })
  assert.equal((await run('get_message', { messageId: 'm1' })).text, 'Read this email.')
  assert.equal((await run('get_message', { messageId: 'm1' })).attachments[0].attachmentId, 'a1')
  const bounded = await run('get_message', { messageId: 'm1', bodyOffset: 2, bodyLimit: 4 })
  assert.equal(bounded.text, 'ad t')
  assert.equal(bounded.bodyView.nextTextOffset, 6)
  assert.equal(bounded.html, undefined)
  assert.match((await run('get_message', { messageId: 'm1', messageFormat: 'FULL_CONTENT' })).html, /<p>/u)
  scopes = [scope('send')]
  const sendTools = (await client.listTools()).tools.map(tool => tool.name)
  assert.ok(sendTools.includes('send_message') && !sendTools.includes('send_draft'), 'gmail.send cannot send existing drafts')
  scopes = [scope('compose')]
  const draftTools = (await client.listTools()).tools.map(tool => tool.name)
  assert.ok(draftTools.includes('send_draft') && draftTools.includes('get_draft') && !draftTools.includes('get_message'))
  await client.verifyAccount()
  await assert.rejects(() => run('create_draft', { replyToMessageId: 'm1' }), /not granted/u)
  scopes = [scope('modify')]
  assert.equal((await client.listTools()).tools.length, GMAIL_API_TOOLS.length, 'modify covers ordinary Gmail operations, not permanent deletion')
  assert.equal(GMAIL_API_TOOLS.some(tool => tool.name === 'delete_message' || tool.name === 'delete_thread'), false)
  const samples = {
    get_message: { messageId: 'm1' }, get_thread: { threadId: 't1' }, get_attachment: { messageId: 'm1', attachmentId: 'a1' },
    get_draft: { draftId: 'd1' }, create_draft: { to: ['Recipient <recipient@example.test>'], subject: 'Hello', body: 'Draft only.', replyToMessageId: 'm1' },
    update_draft: { draftId: 'd1', body: 'Updated.' }, delete_draft: { draftId: 'd1' }, send_draft: { draftId: 'd1' }, send_message: { to: ['recipient@example.test'], body: 'Synthetic test only.' },
    create_label: { name: 'Saved' }, update_label: { labelId: 'Label_1', name: 'Saved' }, delete_label: { labelId: 'Label_1' },
    update_message_labels: { messageId: 'm1', addLabelIds: ['STARRED'] }, update_thread_labels: { threadId: 't1', removeLabelIds: ['INBOX'] },
  }
  for (const tool of GMAIL_API_TOOLS) {
    const args = samples[tool.name] || (tool.inputSchema.required.includes('messageId') ? { messageId: 'm1' } : tool.inputSchema.required.includes('threadId') ? { threadId: 't1' } : {})
    const result = await run(tool.name, args)
    assert.equal(JSON.stringify(result).includes('synthetic-host-access-token'), false)
  }
  assert.equal(calls.find(item => item.path === 'drafts/send').body.id, 'd1')
  const created = calls.find(item => item.path === 'drafts' && item.method === 'POST')
  assert.equal(created.body.message.threadId, 't1')
  assert.match(Buffer.from(created.body.message.raw, 'base64url').toString(), /In-Reply-To: <original@example.test>/u)
  assert.ok(calls.some(item => item.path === 'messages/m1/trash' && item.method === 'POST'))
  assert.ok(calls.some(item => item.path === 'threads/t1/modify' && item.body.removeLabelIds.includes('INBOX')))
  const permissionReport = await run('get_permissions')
  assert.deepEqual(permissionReport.grantedScopes, scopes)
  assert.equal(permissionReport.chatPermissionsStillApply, true)
  await assert.rejects(() => run('send_message', { to: [], body: 'no recipients' }), /explicit recipient/u)
  await assert.rejects(() => run('send_message', { to: ['recipient@example.test'], from: 'spoof@example.test' }), /unsupported field/u)
  await assert.rejects(() => run('search_messages', { pageSize: 51 }), /out of range/u)
  await assert.rejects(() => run('delete_draft', { draftId: '../messages/m1' }), /invalid string/u)
  await run('get_attachment', { messageId: 'm1', attachmentId: 'opaque'.repeat(80) })
  await assert.rejects(() => run('update_message_labels', { messageId: 'm1', addLabelIds: ['TRASH'] }), /dedicated/u)
  await assert.rejects(() => run('send_message', { to: ['recipient@example.test\r\nBcc: stolen@example.test'] }), /control characters/u)
  scopes = [scope('readonly')]
  await assert.rejects(() => run('send_draft', { draftId: 'd1' }), /not granted/u)
  await client.close()
  await assert.rejects(() => run('get_message', { messageId: 'm1' }), /closed/u)
} finally { await client.close() }

const htmlOnly = readableGmailMessage({ payload: { mimeType: 'text/html', body: { data: Buffer.from('<style>hidden</style><p>Hello &amp; goodbye</p><script>do not execute</script>').toString('base64url') } } })
assert.equal(htmlOnly.text, 'Hello & goodbye')
assert.equal(htmlOnly.textSource, 'html-derived')
assert.equal(htmlOnly.html, undefined)
const large = readableGmailMessage({ payload: { mimeType: 'text/plain', body: { data: Buffer.from('x'.repeat(100_000)).toString('base64url') } } })
assert.equal(large.text.length, 16_000)
assert.equal(large.bodyView.nextTextOffset, 16_000)
const unicodeSubject = 'Olá 日本語 '.repeat(12)
const raw = Buffer.from(composeGmailMessage({ to: ['Recipient, Jr <recipient@example.test>'], cc: ['copy@example.test'], bcc: ['hidden@example.test'], subject: unicodeSubject, body: 'Plain text', htmlBody: '<p>HTML</p>', attachments: [{ filename: 'résumé.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf-content').toString('base64') }] }).raw, 'base64url').toString()
assert.match(raw, /multipart\/mixed/u)
assert.match(raw, /multipart\/alternative/u)
assert.match(raw, /Bcc: hidden@example.test/u)
assert.match(raw, /filename\*=UTF-8''r%C3%A9sum%C3%A9.pdf/u)
assert.ok(raw.includes(Buffer.from('pdf-content').toString('base64')))
assert.equal(decodeGmailHeader(/Subject: ([\s\S]*?)\r\nMIME-Version/u.exec(raw)[1]), unicodeSubject)
assert.throws(() => composeGmailMessage({ subject: 'Subject\r\nBcc: stolen@example.test' }), /control characters/u)
assert.throws(() => composeGmailMessage({ attachments: [{ filename: 'x', mimeType: 'text/plain', data: 'bad%data' }] }), /base64/u)

let attempts = 0
const uncertain = new GmailApiClient({ getAccess: async () => ({ accessToken: 'synthetic', scopes: [scope('modify')] }), fetch: async () => { attempts++; throw Error('Do not expose this request URL or credential.') } })
await assert.rejects(() => uncertain.callTool({ name: 'send_message', arguments: { to: ['recipient@example.test'] } }), /uncertain; no automatic retry/u)
assert.equal(attempts, 1)
await uncertain.close()
let refreshes = 0
let httpRequests = 0
const refreshClient = new GmailApiClient({ getAccess: async ({ forceRefresh }) => { if (forceRefresh) refreshes++; return { accessToken: 'synthetic', scopes: [scope('modify')] } }, fetch: async () => { httpRequests++; return httpRequests === 1 ? new Response(null, { status: 401 }) : Response.json({ id: 'sent1' }) } })
await refreshClient.callTool({ name: 'send_message', arguments: { to: ['recipient@example.test'] } })
assert.equal(httpRequests, 2, 'only an explicit 401 rejection permits one retry')
assert.equal(refreshes, 1)
await refreshClient.close()
const badJsonClient = new GmailApiClient({ getAccess: async () => ({ accessToken: 'synthetic', scopes: [scope('modify')] }), fetch: async () => new Response('bad JSON', { status: 200 }) })
await assert.rejects(() => badJsonClient.callTool({ name: 'send_message', arguments: { to: ['recipient@example.test'] } }), /Google accepted.*Do not repeat/u)
await badJsonClient.close()
console.log('Gmail API operations, partial grants, execution checks, MIME/replies/attachments, cancellation and safe send retries passed (synthetic only).')
