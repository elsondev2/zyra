import assert from 'node:assert/strict'
import { CalendarApiClient } from '../src/plugins/calendar-api-client.mjs'
import { CALENDAR_API_TOOLS, calendarCapabilityGranted } from '../src/plugins/calendar-api-tools.mjs'

// Synthetic only: no real account, credentials or network.
const scope = name => `https://www.googleapis.com/auth/${name}`
const read = [scope('calendar.readonly')]
const write = [scope('calendar.events')]
const window = { startTime: '2026-03-08T00:00:00-05:00', endTime: '2026-03-09T00:00:00-04:00' }
const timed = { summary: 'Synthetic event', startTime: '2026-03-08T10:00:00-04:00', endTime: '2026-03-08T11:00:00-04:00', timeZone: 'America/New_York' }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
function fixture(scopes = read, handler = () => json({})) {
  const calls = [], accesses = [], failures = []
  const client = new CalendarApiClient({ now: () => Date.parse('2026-03-08T12:00:00Z'),
    getAccess: async options => { accesses.push(options.forceRefresh === true); return { accessToken: 'synthetic-only', scopes } },
    onAuthorizationFailure: async status => failures.push(status),
    fetch: async (url, options) => { calls.push({ url: new URL(url), ...options, body: options.body ? JSON.parse(options.body) : undefined }); return handler(calls.at(-1), calls.length) },
  })
  return { client, calls, accesses, failures }
}
const call = (f, name, args = {}, options) => f.client.callTool({ name, arguments: args }, options)
const result = response => JSON.parse(response.content[0].text)
const tests = []
const test = (name, run) => tests.push([name, run])

test('scope-aware catalog and execution denial', async () => {
  const f = fixture()
  const names = (await f.client.listTools()).tools.map(t => t.name)
  assert(names.includes('list_calendars') && names.includes('get_event') && names.includes('suggest_time'))
  assert(!names.includes('create_event'))
  await assert.rejects(call(f, 'create_event', timed), /grant|permission/i)
  assert.equal(f.calls.length, 0)
  assert.equal(calendarCapabilityGranted([scope('calendar.calendarlist.readonly')], 'eventsRead'), false)
  assert.equal(calendarCapabilityGranted([scope('calendar.events.freebusy')], 'freebusy'), true)
  assert.equal(calendarCapabilityGranted(write, 'eventsWrite'), true)
  assert.equal(calendarCapabilityGranted(write, 'calendarList'), false)
  assert.equal(CALENDAR_API_TOOLS.length, 10)
  const permissions = result(await call(f, 'get_permissions'))
  assert.equal(permissions.capabilities.eventsWrite, false)
  assert.equal(JSON.stringify(permissions).includes('synthetic-only'), false)
})

test('real safe verification by each granted read surface', async () => {
  for (const [scopes, suffix] of [[read, ['', 'users', 'me', 'calendarList'].join('/')], [write, '/calendars/primary/events'], [[scope('calendar.freebusy')], '/freeBusy']]) {
    const f = fixture(scopes, () => json({ calendars: { primary: { busy: [] } } }))
    const verified = await f.client.verifyAccount()
    assert(verified.toolCount > 0)
    assert.equal(f.calls.length, 1)
    assert(f.calls[0].url.pathname.endsWith(suffix))
    if (f.calls[0].method === 'GET') { assert.equal(f.calls[0].url.searchParams.get('maxResults'), '1'); assert(f.calls[0].url.searchParams.get('fields')) }
  }
  const none = fixture([])
  await assert.rejects(none.client.verifyAccount(), /grant|permission/i)
  assert.equal(none.calls.length, 0)
})

test('bounded pagination, explicit overlap semantics, keyword search and encoded IDs', async () => {
  const f = fixture(read, () => json({ items: [{ id: 'a', start: { date: '2026-03-08' }, end: { date: '2026-03-09' } }], nextPageToken: 'opaque +/# token' }))
  const data = result(await call(f, 'list_events', { ...window, calendarId: 'team#room@example.test', pageToken: 'opaque +/# token', pageSize: 7, timeZone: 'America/New_York' }))
  assert.equal(data.nextPageToken, 'opaque +/# token')
  assert.equal(data.items[0].start.date, '2026-03-08')
  const url = f.calls[0].url
  assert.equal(url.origin, 'https://www.googleapis.com')
  assert(url.pathname.includes('team%23room%40example.test'))
  assert.equal(url.searchParams.get('timeMin'), window.startTime)
  assert.equal(url.searchParams.get('timeMax'), window.endTime)
  assert.equal(url.searchParams.get('singleEvents'), 'true')
  assert.equal(url.searchParams.get('orderBy'), 'startTime')
  assert.equal(url.searchParams.get('pageToken'), 'opaque +/# token')
  assert.equal(f.calls[0].redirect, 'error')
  await call(f, 'get_event', { calendarId: 'x/../../evil#@', eventId: 'opaque/#?@' })
  assert(f.calls[1].url.pathname.startsWith('/calendar/v3/calendars/x%2F'))
  assert(f.calls[1].url.pathname.endsWith('/events/opaque%2F%23%3F%40'))
  await call(f, 'search_events', { ...window, query: 'keyword phrase' })
  assert.equal(f.calls[2].url.searchParams.get('q'), 'keyword phrase')
})

test('execution rejects unsupported parameters, temporal errors and size bypasses before HTTP', async () => {
  const f = fixture([scope('calendar')])
  for (const args of [{ ...window, pageSize: 51 }, { ...window, timeZone: 'Not/A_Zone' }, { ...window, startTime: '2026-03-08T10:00:00' }, { ...window, startTime: '2026-02-30T00:00:00Z' }, { ...window, endTime: window.startTime }, { ...window, singleEvents: false }, { calendarId: '..' }]) {
    await assert.rejects(call(f, 'list_events', args))
  }
  await assert.rejects(call(f, 'get_event', { eventId: '..' }))
  await assert.rejects(call(f, 'create_event', { ...timed, description: 'x'.repeat(65537) }))
  await assert.rejects(call(f, 'create_event', { ...timed, conferenceData: { url: 'https://evil.test' } }))
  await assert.rejects(call(f, 'create_event', { ...timed, eventType: 'outOfOffice' }))
  await assert.rejects(call(f, 'create_event', { ...timed, startDate: '2026-03-08' }))
  await assert.rejects(call(f, 'create_event', { summary: 'Invalid date', startDate: '2026-02-30', endDate: '2026-03-01' }))
  assert.equal(f.calls.length, 0)
})

test('ordinary timed/all-day creation, sendUpdates and generated Meet request', async () => {
  const f = fixture(write, c => json(c.body))
  const data = result(await call(f, 'create_event', { ...timed, attendees: ['one@example.test'], createGoogleMeet: true }))
  assert.equal(data.eventType, 'default')
  assert.equal(data.start.dateTime, timed.startTime)
  assert.equal(data.start.timeZone, timed.timeZone)
  assert.equal(data.attendees[0].email, 'one@example.test')
  assert.equal(data.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet')
  assert.match(data.conferenceData.createRequest.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(f.calls[0].url.searchParams.get('sendUpdates'), 'all')
  assert.equal(f.calls[0].url.searchParams.get('conferenceDataVersion'), '1')
  const allDay = result(await call(f, 'create_event', { title: 'All day', startDate: '2026-03-08', endDate: '2026-03-10' }))
  assert.deepEqual(allDay.start, { date: '2026-03-08' })
  assert.deepEqual(allDay.end, { date: '2026-03-10' })
})

const prior = { id: 'abc', etag: '"revision1"', eventType: 'default', summary: 'Keep', location: 'Keep location', start: { dateTime: '2026-03-07T10:00:00-05:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-03-07T11:30:00-05:00', timeZone: 'America/New_York' }, attendees: [{ email: 'self@example.test', self: true, responseStatus: 'needsAction', displayName: 'Self' }, { email: 'other@example.test', responseStatus: 'accepted', optional: true }], reminders: { useDefault: true } }
test('update reads prior, preserves duration and unrelated fields, uses If-Match', async () => {
  const f = fixture(write, c => json(c.method === 'GET' ? prior : c.body))
  const data = result(await call(f, 'update_event', { eventId: 'abc', startTime: '2026-03-08T10:00:00-04:00' }))
  assert.equal(f.calls[0].method, 'GET')
  assert.equal(f.calls[1].method, 'PATCH')
  assert.equal(f.calls[1].headers['if-match'], prior.etag)
  assert.equal(Date.parse(data.end.dateTime) - Date.parse(data.start.dateTime), 90 * 60_000)
  assert.equal(data.start.timeZone, 'America/New_York')
  assert(!Object.hasOwn(data, 'attendees') && !Object.hasOwn(data, 'summary') && !Object.hasOwn(data, 'reminders'))
  const allDay = fixture(write, c => json(c.method === 'GET' ? { ...prior, start: { date: '2026-03-08' }, end: { date: '2026-03-10' } } : c.body))
  assert.equal(result(await call(allDay, 'update_event', { eventId: 'abc', startDate: '2026-03-10' })).end.date, '2026-03-12')
})

test('RSVP only self, attendee omission semantics and concurrency conflict', async () => {
  const f = fixture(write, c => json(c.method === 'GET' ? prior : c.body))
  const data = result(await call(f, 'respond_to_event', { eventId: 'abc', responseStatus: 'accepted' }))
  assert.equal(data.attendeesOmitted, true)
  assert.equal(data.attendees.length, 1)
  assert.equal(data.attendees[0].email, 'self@example.test')
  assert.equal(data.attendees[0].displayName, 'Self')
  assert.equal(data.attendees[0].responseStatus, 'accepted')
  assert.equal(f.calls[1].headers['if-match'], prior.etag)
  const absent = fixture(write, () => json({ ...prior, attendees: [prior.attendees[1]] }))
  await assert.rejects(call(absent, 'respond_to_event', { eventId: 'abc', responseStatus: 'accepted' }), /self|attendee/i)
  assert.equal(absent.calls.length, 1)
  const conflict = fixture(write, c => c.method === 'GET' ? json(prior) : json({ error: { message: 'untrusted secret' } }, 412))
  await assert.rejects(call(conflict, 'update_event', { eventId: 'abc', summary: 'changed' }), /changed|conflict|412/i)
  assert.equal(conflict.calls.length, 2)
  const special = fixture(write, () => json({ ...prior, eventType: 'outOfOffice' }))
  await assert.rejects(call(special, 'update_event', { eventId: 'abc', summary: 'changed' }), /ordinary|special/i)
  assert.equal(special.calls.length, 1)
})

test('401 refresh exactly once, 403 callback and sanitized errors', async () => {
  const f = fixture(write, (_c, n) => n === 1 ? json({}, 401) : json({ id: 'new' }))
  await call(f, 'create_event', timed)
  assert.equal(f.calls.length, 2)
  assert.equal(f.accesses.filter(Boolean).length, 1)
  const denied = fixture(write, () => json({ error: { message: 'untrusted synthetic secret' } }, 401))
  await assert.rejects(call(denied, 'create_event', timed), /authorization|reconnect/i)
  assert.equal(denied.calls.length, 2)
  assert.deepEqual(denied.failures, [401])
  const forbidden = fixture(read, () => json({}, 403))
  await assert.rejects(call(forbidden, 'list_calendars'), /permission|denied/i)
  assert.deepEqual(forbidden.failures, [403])
})

test('uncertain writes never retry and accepted unread/oversized writes warn', async () => {
  for (const behavior of [() => { throw new Error('synthetic secret') }, () => json({}, 429), () => json({}, 500)]) {
    const f = fixture(write, behavior)
    await assert.rejects(call(f, 'create_event', timed), error => !error.message.includes('synthetic secret'))
    assert.equal(f.calls.length, 1)
    assert.equal(f.accesses.filter(Boolean).length, 0)
  }
  for (const response of [new Response('{broken'), json({ description: 'x'.repeat(300_000) }), new Response('x', { headers: { 'content-length': '99999999' } })]) {
    const f = fixture(write, () => response)
    await assert.rejects(call(f, 'create_event', timed), /accepted.*(read|limit)|inspect|repeat/i)
    assert.equal(f.calls.length, 1)
  }
})

test('freebusy fails closed, bounds and DST-aware local preferences', async () => {
  const args = { ...window, calendarIds: ['primary', 'room@example.test'], durationMinutes: 30, timeZone: 'America/New_York', preferences: { startHour: 9, endHour: 12, daysOfWeek: [0] }, maxSuggestions: 2 }
  const f = fixture([scope('calendar.freebusy')], () => json({ calendars: { primary: { busy: [{ start: '2026-03-08T09:00:00-04:00', end: '2026-03-08T10:00:00-04:00' }] }, 'room@example.test': { busy: [] } } }))
  const data = result(await call(f, 'suggest_time', args))
  assert.equal(data.suggestions.length, 2)
  assert.equal(Date.parse(data.suggestions[0].startTime), Date.parse('2026-03-08T10:00:00-04:00'))
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.calendarExpansionMax, 10)
  for (const calendars of [{ primary: { busy: [] } }, { primary: { busy: [], errors: [{ reason: 'notFound' }] }, 'room@example.test': { busy: [] } }, { primary: {}, 'room@example.test': { busy: [] } }]) {
    const bad = fixture(read, () => json({ calendars }))
    await assert.rejects(call(bad, 'suggest_time', args), /busy|calendar|availability/i)
  }
  const bounded = fixture(read)
  for (const extra of [{ endTime: '2026-05-08T00:00:00Z' }, { attendees: Array(11).fill('a@example.test') }, { durationMinutes: 0 }, { stepMinutes: 0 }, { maxSuggestions: 21 }, { preferences: { startHour: 18, endHour: 9 } }]) await assert.rejects(call(bounded, 'suggest_time', { ...args, ...extra }))
  assert.equal(bounded.calls.length, 0)
})

test('abort and close fence ignoring transports and body streams', async () => {
  const pending = fixture(read, () => new Promise(() => {}))
  const controller = new AbortController()
  const p = call(pending, 'list_calendars', {}, { signal: controller.signal })
  await new Promise(resolve => setTimeout(resolve, 10))
  controller.abort()
  await assert.rejects(p)
  const closed = fixture(read)
  await closed.client.close()
  await assert.rejects(call(closed, 'list_calendars'))
  assert.equal(closed.calls.length, 0)
  const streaming = fixture(read, () => new Response(new ReadableStream({ pull() { return new Promise(() => {}) } })))
  const s = call(streaming, 'list_calendars')
  await new Promise(resolve => setTimeout(resolve, 10))
  await streaming.client.close()
  await assert.rejects(s)
})

test('all scope subsets advertise only their actual capabilities', async () => {
  const cases = [
    ['calendar.calendarlist.readonly', ['get_permissions', 'list_calendars']],
    ['calendar.calendarlist', ['get_permissions', 'list_calendars']],
    ['calendar.events.readonly', ['get_permissions', 'list_events', 'get_event', 'search_events', 'suggest_time']],
    ['calendar.events.freebusy', ['get_permissions', 'suggest_time']],
    ['calendar.freebusy', ['get_permissions', 'suggest_time']],
    ['calendar.events', ['get_permissions', 'list_events', 'get_event', 'search_events', 'suggest_time', 'create_event', 'update_event', 'delete_event', 'respond_to_event']],
  ]
  for (const [grant, expected] of cases) {
    const f = fixture([scope(grant)])
    assert.deepEqual((await f.client.listTools()).tools.map(tool => tool.name), expected)
    assert.equal(f.calls.length, 0)
    for (const forbidden of ['create_event', 'delete_event', 'respond_to_event'].filter(name => !expected.includes(name))) {
      const args = forbidden === 'create_event' ? timed : forbidden === 'delete_event' ? { eventId: 'abc' } : { eventId: 'abc', responseStatus: 'accepted' }
      await assert.rejects(call(f, forbidden, args), /permission|grant/i)
    }
    assert.equal(f.calls.length, 0)
  }
})

test('transport fences capability bypass and dot-segment calendar deletion', async () => {
  const f = fixture(read)
  await assert.rejects(f.client.request('POST', 'calendars/primary/events', 'permissions', { body: timed }), /capability/i)
  await assert.rejects(f.client.request('DELETE', 'calendars/primary/events/%2E%2E', 'eventsWrite'), /destination/i)
  await assert.rejects(f.client.request('DELETE', 'calendars/primary', 'eventsWrite'), /operation/i)
  await assert.rejects(f.client.request('POST', 'calendars/primary/events', 'eventsWrite', { body: timed }), /grant|permission/i)
  assert.equal(f.calls.length, 0)
})

test('bounded streams and aggregate input/output limits', async () => {
  const oversized = fixture(read, () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(600_000)); controller.enqueue(new Uint8Array(600_000)); controller.close()
  } })))
  await assert.rejects(call(oversized, 'list_calendars'), /response|size|limit/i)
  assert.equal(oversized.calls.length, 1)
  const output = fixture(read, () => json({ items: [{ description: 'x'.repeat(270_000) }] }))
  await assert.rejects(call(output, 'list_events'), /256 KiB|tool limit/i)
  const aggregate = fixture(write)
  await assert.rejects(call(aggregate, 'create_event', { ...timed, description: 'x'.repeat(48_000), attendees: Array.from({ length: 100 }, (_, i) => `${i}${'a'.repeat(240)}@example.test`) }), /64 KiB/i)
  assert.equal(aggregate.calls.length, 0)
})

test('delete is event-only, etag guarded and default notifications; attendee updates retain RSVP', async () => {
  const f = fixture(write, c => c.method === 'GET' ? json(prior) : new Response(null, { status: 204 }))
  assert.equal(result(await call(f, 'delete_event', { calendarId: 'room#@example.test', eventId: 'abc' })).deletedEventId, 'abc')
  assert.equal(f.calls[1].method, 'DELETE')
  assert(f.calls[1].url.pathname.endsWith('/events/abc'))
  assert.equal(f.calls[1].headers['if-match'], prior.etag)
  assert.equal(f.calls[1].url.searchParams.get('sendUpdates'), 'all')
  const noEtag = fixture(write, () => json({ ...prior, etag: undefined }))
  await assert.rejects(call(noEtag, 'delete_event', { eventId: 'abc' }), /etag/i)
  assert.equal(noEtag.calls.length, 1)
  const attendees = fixture(write, c => json(c.method === 'GET' ? prior : c.body))
  const data = result(await call(attendees, 'update_event', { eventId: 'abc', attendees: ['other@example.test', 'new@example.test'], sendUpdates: 'externalOnly' }))
  assert.equal(data.attendees[0].responseStatus, 'accepted')
  assert.equal(data.attendees[0].optional, true)
  assert.deepEqual(data.attendees[1], { email: 'new@example.test' })
  assert.equal(attendees.calls[1].url.searchParams.get('sendUpdates'), 'externalOnly')
})

test('401 refreshed scopes are rechecked; failures never trigger follow-on write', async () => {
  const f = fixture(write, () => json({}, 401))
  f.client.getAccess = async ({ forceRefresh }) => ({ accessToken: 'synthetic-only', scopes: forceRefresh ? read : write })
  await assert.rejects(call(f, 'create_event', timed), /permission|grant/i)
  assert.equal(f.calls.length, 1)
  const unavailable = fixture(write)
  unavailable.client.getAccess = async () => { throw new Error('synthetic sensitive auth detail') }
  await assert.rejects(call(unavailable, 'create_event', timed), error => !error.message.includes('sensitive'))
  assert.equal(unavailable.calls.length, 0)
  const preAborted = fixture(write)
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(call(preAborted, 'create_event', timed, { signal: cancelled.signal }))
  assert.equal(preAborted.calls.length, 0)
  const duringRead = fixture(write)
  duringRead.client.fetch = async () => { await duringRead.client.close(); return json(prior) }
  await assert.rejects(call(duringRead, 'update_event', { eventId: 'abc', summary: 'changed' }))
})

test('timed-out and cancelled writes warn without retry; accepted stream cancellation is explicit', async () => {
  const timedOut = fixture(write, () => new Promise(() => {}))
  timedOut.client.signal = signal => AbortSignal.any([timedOut.client.controller.signal, AbortSignal.timeout(10), ...(signal ? [signal] : [])])
  const keepAlive = setTimeout(() => {}, 1000)
  try { await assert.rejects(call(timedOut, 'create_event', timed), /uncertain.*no automatic retry/i) }
  finally { clearTimeout(keepAlive) }
  assert.equal(timedOut.calls.length, 1)
  assert.equal(timedOut.accesses.filter(Boolean).length, 0)
  const accepted = fixture(write, () => new Response(new ReadableStream({ pull() { return new Promise(() => {}) } })))
  const pending = call(accepted, 'create_event', timed)
  await new Promise(resolve => setTimeout(resolve, 10))
  await accepted.client.close()
  await assert.rejects(pending, /accepted.*response.*read/i)
  assert.equal(accepted.calls.length, 1)
})

test('freebusy verification cannot succeed on missing, errored or invalid calendars', async () => {
  for (const data of [{ calendars: {} }, { calendars: { primary: { errors: [{ reason: 'notFound' }], busy: [] } } }, { calendars: { primary: { busy: [{ start: 'invalid', end: 'invalid' }] } } }]) {
    const f = fixture([scope('calendar.freebusy')], () => json(data))
    await assert.rejects(f.client.verifyAccount(), /calendar|busy|availability/i)
    assert.equal(f.calls.length, 1)
  }
  const f = fixture(read, () => json({ calendars: { primary: { busy: [] } } }))
  const data = result(await call(f, 'suggest_time', { startTime: '2026-11-01T00:00:00-04:00', endTime: '2026-11-01T04:00:00-05:00', durationMinutes: 30, timeZone: 'America/New_York', preferences: { startHour: 1, endHour: 2, daysOfWeek: [0] }, maxSuggestions: 8, stepMinutes: 30 }))
  assert.equal(data.suggestions.length, 4) // both repeated 01:00/01:30 hours
  assert.equal(new Set(data.suggestions.map(item => item.startTime)).size, 4)
})

for (const [name, run] of tests) {
  await run()
  console.log(`ok - ${name}`)
}
console.log(`Calendar API: ${tests.length} synthetic focused checks passed`)
