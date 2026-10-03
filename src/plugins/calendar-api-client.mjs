import { randomUUID } from 'node:crypto'
import { CALENDAR_API_TOOLS, CALENDAR_API_SCOPE_GROUPS, calendarCapabilityGranted, validateCalendarArguments,
  parseCalendarDate, parseCalendarTimestamp, validateCalendarTimeZone, calendarSegment } from './calendar-api-tools.mjs'

const ROOT = 'https://www.googleapis.com/calendar/v3/'
const MAX_INPUT_BYTES = 64 * 1024
const MAX_RESULT_BYTES = 256 * 1024
const MAX_HTTP_BYTES = 1024 * 1024
const DAY = 86_400_000
const MINUTE = 60_000
const own = (value, key) => Object.hasOwn(value, key)
const cancelBody = response => { try { Promise.resolve(response.body?.cancel()).catch(() => {}) } catch {} }

// A transport may ignore AbortSignal. Race every asynchronous boundary and
// fence its completion; late responses never launch another request or write.
function boundedWait(run, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(new Error('Calendar operation was cancelled or timed out.')) }
    signal.addEventListener('abort', aborted, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return run() }).then(value => {
      signal.removeEventListener('abort', aborted)
      if (signal.aborted) reject(new Error('Calendar operation was cancelled or timed out.'))
      else resolve(value)
    }, error => { signal.removeEventListener('abort', aborted); reject(error) })
  })
}
async function responseJson(response, signal) {
  signal.throwIfAborted()
  const length = Number(response.headers?.get('content-length') || 0)
  if (length > MAX_HTTP_BYTES) { cancelBody(response); throw new Error('Calendar response exceeds the HTTP read limit.') }
  if (!response.body) return {}
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await boundedWait(() => reader.read(), signal)
      if (done) break
      size += value.byteLength
      if (size > MAX_HTTP_BYTES) throw new Error('Calendar response exceeds the HTTP read limit.')
      chunks.push(value)
    }
    signal.throwIfAborted()
    if (!size) return {}
    let data
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new Error('Calendar returned an invalid API response.') }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Calendar returned an invalid API response.')
    return data
  } catch (error) {
    // Do not wait for cancellation of an uncooperative stream.
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    throw error
  } finally { try { reader.releaseLock() } catch {} }
}
function validWindow(args, required = false) {
  const start = args.startTime === undefined ? undefined : parseCalendarTimestamp(args.startTime)
  const end = args.endTime === undefined ? undefined : parseCalendarTimestamp(args.endTime)
  if (required && (start === undefined || end === undefined)) throw new Error('Calendar window requires startTime and endTime.')
  if (start !== undefined && end !== undefined && end <= start) throw new Error('Calendar window endTime must follow startTime.')
  return { start, end }
}
function safeEtag(event) {
  if (typeof event.etag !== 'string' || !event.etag.length || event.etag.length > 1024 || /[\u0000-\u001f\u007f]/u.test(event.etag)) throw new Error('Calendar did not provide a safe event etag; no change was made.')
  return event.etag
}
function ordinary(event) {
  if (event.eventType && event.eventType !== 'default') throw new Error('Only ordinary events can be changed; special event writes are unavailable.')
  if (event.status === 'cancelled') throw new Error('This event is cancelled; no change was made.')
}
function attendeeList(emails, prior = []) {
  const seen = new Set()
  return emails.map(email => {
    const key = email.toLowerCase()
    if (seen.has(key)) throw new Error('Calendar attendee emails must be unique.')
    seen.add(key)
    const old = prior.find(item => typeof item.email === 'string' && item.email.toLowerCase() === key)
    return old ? { ...old, email } : { email }
  })
}
function eventBody(args, prior) {
  if (own(args, 'summary') && own(args, 'title')) throw new Error('Supply summary or title, not both.')
  const body = {}
  if (own(args, 'summary') || own(args, 'title')) body.summary = args.summary ?? args.title
  for (const key of ['description', 'location']) if (own(args, key)) body[key] = args[key]
  if (own(args, 'attendees')) body.attendees = attendeeList(args.attendees, prior?.attendees || [])
  const timed = own(args, 'startTime') || own(args, 'endTime')
  const allDay = own(args, 'startDate') || own(args, 'endDate')
  if (timed && allDay) throw new Error('Use timed timestamps or all-day dates, never both.')
  if (allDay && own(args, 'timeZone')) throw new Error('All-day dates do not accept a timeZone.')
  if (!prior) {
    if (typeof body.summary !== 'string' || !body.summary.trim()) throw new Error('Creating an event requires an explicit summary or title.')
    if (!(timed && args.startTime && args.endTime || allDay && args.startDate && args.endDate)) throw new Error('Creating an event requires a complete timed or all-day interval.')
    body.eventType = 'default'
  }
  if (prior && (timed && !prior.start?.dateTime || allDay && !prior.start?.date)) throw new Error('Changing between timed and all-day events is not supported.')
  if (timed) {
    const startValue = args.startTime ?? prior?.start?.dateTime
    let endValue = args.endTime ?? prior?.end?.dateTime
    if (prior && own(args, 'startTime') && !own(args, 'endTime')) {
      const duration = parseCalendarTimestamp(prior.end?.dateTime) - parseCalendarTimestamp(prior.start?.dateTime)
      if (duration <= 0) throw new Error('Prior Calendar event duration is invalid.')
      endValue = new Date(parseCalendarTimestamp(startValue) + duration).toISOString()
    }
    if (parseCalendarTimestamp(endValue) <= parseCalendarTimestamp(startValue)) throw new Error('Calendar event end must follow start.')
    const zone = args.timeZone ?? prior?.start?.timeZone
    const endZone = args.timeZone ?? prior?.end?.timeZone ?? zone
    if (zone !== undefined) validateCalendarTimeZone(zone)
    if (endZone !== undefined) validateCalendarTimeZone(endZone)
    if (own(args, 'startTime') || !prior || own(args, 'timeZone')) body.start = { dateTime: startValue, ...(zone ? { timeZone: zone } : {}) }
    if (own(args, 'endTime') || own(args, 'startTime') || !prior || own(args, 'timeZone')) body.end = { dateTime: endValue, ...(endZone ? { timeZone: endZone } : {}) }
  } else if (allDay) {
    const startValue = args.startDate ?? prior?.start?.date
    let endValue = args.endDate ?? prior?.end?.date
    if (prior && own(args, 'startDate') && !own(args, 'endDate')) {
      const duration = parseCalendarDate(prior.end?.date) - parseCalendarDate(prior.start?.date)
      if (duration <= 0) throw new Error('Prior Calendar all-day duration is invalid.')
      endValue = new Date(parseCalendarDate(startValue) + duration).toISOString().slice(0, 10)
    }
    if (parseCalendarDate(endValue) <= parseCalendarDate(startValue)) throw new Error('All-day endDate must follow startDate (end is exclusive).')
    if (own(args, 'startDate') || !prior) body.start = { date: startValue }
    if (own(args, 'endDate') || own(args, 'startDate') || !prior) body.end = { date: endValue }
  } else if (own(args, 'timeZone')) {
    if (!prior?.start?.dateTime || !prior?.end?.dateTime) throw new Error('An all-day event cannot have a timeZone.')
    body.start = { dateTime: prior.start.dateTime, timeZone: args.timeZone }
    body.end = { dateTime: prior.end.dateTime, timeZone: args.timeZone }
  }
  if (args.createGoogleMeet) body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  if (prior && !Object.keys(body).length) throw new Error('Choose at least one event field to update.')
  return body
}
function freebusyIds(args) {
  const ids = [...(args.calendarIds || ['primary']), ...(args.attendees || [])]
  if (ids.length > 10 || !ids.length || new Set(ids).size !== ids.length) throw new Error('Use at most ten unique calendars and attendees combined.')
  for (const id of ids) calendarSegment(id)
  return ids
}
function busyIntervals(data, ids) {
  if (data.groups && Object.keys(data.groups).length) throw new Error('Calendar groups are not supported; select explicit calendars.')
  if (!data.calendars || typeof data.calendars !== 'object') throw new Error('Calendar availability response is missing calendars.')
  const busy = []
  for (const id of ids) {
    if (!own(data.calendars, id)) throw new Error('A requested calendar is missing from availability; no free time can be inferred.')
    const calendar = data.calendars[id]
    if (!calendar || calendar.errors && (!Array.isArray(calendar.errors) || calendar.errors.length) || !Array.isArray(calendar.busy)) throw new Error('Calendar free/busy failed for a requested calendar; no free time can be inferred.')
    if (calendar.busy.length > 10_000) throw new Error('Calendar free/busy exceeds the interval limit; narrow the window.')
    for (const item of calendar.busy) {
      let start, end
      try { start = parseCalendarTimestamp(item.start); end = parseCalendarTimestamp(item.end) }
      catch { throw new Error('Calendar free/busy returned an invalid interval.') }
      if (end <= start) throw new Error('Calendar free/busy returned an invalid interval.')
      if (busy.length >= 10_000) throw new Error('Calendar free/busy exceeds the combined interval limit; narrow the window.')
      busy.push({ start, end })
    }
  }
  return busy.sort((a, b) => a.start - b.start)
}
function preferenceCheck(timeZone, preferences = {}) {
  const low = preferences.startHour ?? 0, high = preferences.endHour ?? 24
  if (high <= low) throw new Error('Calendar local preference endHour must follow startHour.')
  const days = new Set(preferences.daysOfWeek || [0, 1, 2, 3, 4, 5, 6])
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' })
  const cache = new Map()
  return ms => {
    if (cache.has(ms)) return cache.get(ms)
    if (cache.size >= 100_000) throw new Error('Calendar local preference evaluation limit exceeded; narrow the window.')
    const parts = Object.fromEntries(fmt.formatToParts(ms).map(part => [part.type, part.value]))
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
    const hour = +parts.hour + +parts.minute / 60 + +parts.second / 3600
    const accepted = days.has(day) && hour >= low && hour < high
    cache.set(ms, accepted)
    return accepted
  }
}
async function suggestions(args, busy, signal) {
  const { start, end } = validWindow(args, true)
  const duration = args.durationMinutes * MINUTE, step = (args.stepMinutes || 15) * MINUTE
  const accepts = preferenceCheck(args.timeZone, args.preferences)
  const found = []
  let iterations = 0, busyIndex = 0
  for (let candidate = start; candidate + duration <= end; candidate += step) {
    if (++iterations > 10_000) throw new Error('Calendar candidate iteration limit exceeded; narrow the window.')
    if (iterations % 64 === 0) await boundedWait(() => new Promise(resolve => setTimeout(resolve, 0)), signal)
    signal.throwIfAborted()
    const finish = candidate + duration
    while (busyIndex < busy.length && busy[busyIndex].end <= candidate) busyIndex++
    if (busyIndex < busy.length && busy[busyIndex].start < finish) continue
    // Sample every minute as well as both endpoints: a DST transition or an
    // overnight interval cannot cross outside the selected local hours/days.
    let allowed = accepts(candidate) && accepts(finish - 1)
    for (let sample = candidate + MINUTE; allowed && sample < finish; sample += MINUTE) allowed = accepts(sample)
    if (!allowed) continue
    found.push({ startTime: new Date(candidate).toISOString(), endTime: new Date(finish).toISOString(), timeZone: args.timeZone })
    if (found.length >= (args.maxSuggestions || 5)) break
  }
  return { suggestions: found, timeZone: args.timeZone, availabilityIsSnapshot: true }
}

/** Host-owned OAuth access only; model arguments can never select an API host,
 * token, scope, arbitrary conference URL, calendar settings or ACL operation. */
export class CalendarApiClient {
  constructor({ getAccess, fetch = globalThis.fetch, onAuthorizationFailure = async () => {}, now = Date.now }) {
    if (typeof getAccess !== 'function' || typeof fetch !== 'function') throw new Error('Calendar requires host-owned access and a fetch transport.')
    this.getAccess = getAccess
    this.fetch = fetch
    this.onAuthorizationFailure = onAuthorizationFailure
    this.now = now
    this.controller = new AbortController()
  }
  signal(signal) { return AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]) }
  async access(capability, signal, forceRefresh = false) {
    let access
    try { access = await boundedWait(() => this.getAccess({ signal, forceRefresh }), signal) }
    catch { throw new Error('Calendar authorization is unavailable or was cancelled. Reconnect if needed.') }
    signal.throwIfAborted()
    if (!access || !calendarCapabilityGranted(access.scopes, capability)) throw new Error(`Google has not granted Calendar ${capability} permission. Reconnect and choose the relevant permission; no scopes were expanded.`)
    if (typeof access.accessToken !== 'string' || !access.accessToken.length || /[\r\n]/u.test(access.accessToken)) throw new Error('Calendar authorization is unavailable. Reconnect this account.')
    return access
  }
  async request(method, path, capability, { query, body, headers, signal } = {}, refreshed = false) {
    signal = signal || this.signal()
    signal.throwIfAborted()
    // Every path is built by this module, but fence the public method as well.
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method) || typeof path !== 'string' || !/^(?:users\/me\/calendarList|freeBusy|calendars\/[^/]+\/events(?:\/[^/]+)?)$/u.test(path)) throw new Error('Invalid Calendar API operation.')
    let requiredCapability
    if (path === 'users/me/calendarList' && method === 'GET') requiredCapability = 'calendarList'
    else if (path === 'freeBusy' && method === 'POST') requiredCapability = 'freebusy'
    else if (path.startsWith('calendars/')) {
      const itemPath = path.split('/').length === 4
      if (method === 'GET') requiredCapability = 'eventsRead'
      else if (!itemPath && method === 'POST' || itemPath && ['PATCH', 'DELETE'].includes(method)) requiredCapability = 'eventsWrite'
    }
    if (!requiredCapability || capability !== requiredCapability) throw new Error('Invalid Calendar API capability for this operation.')
    if (headers && Object.keys(headers).some(key => key !== 'if-match')) throw new Error('Unsupported Calendar API request header.')
    const url = new URL(path, ROOT)
    if (url.origin !== 'https://www.googleapis.com' || url.pathname !== `/calendar/v3/${path}`) throw new Error('Invalid Calendar API destination.')
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, String(value))
    const access = await this.access(capability, signal, refreshed)
    const mutation = capability === 'eventsWrite' && method !== 'GET'
    let response
    try {
      response = await boundedWait(async () => {
        const received = await this.fetch(url, { method, headers: { authorization: `Bearer ${access.accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(headers || {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, redirect: 'error' })
        if (signal.aborted) cancelBody(received)
        return received
      }, signal)
    } catch {
      throw new Error(mutation ? 'Calendar action failed or was cancelled. Its result may be uncertain; no automatic retry was made. Inspect the calendar before retrying.' : 'Calendar API read failed or was cancelled; no automatic retry was made.')
    }
    if (response.status === 401 && !refreshed) {
      cancelBody(response)
      signal.throwIfAborted()
      // Only explicit rejection allows one refresh/retry. All other failures,
      // including redirects, disconnects, timeouts, 429 and 5xx, are terminal.
      return this.request(method, path, capability, { query, body, headers, signal }, true)
    }
    if (!response.ok) {
      const data = await responseJson(response, signal).catch(() => ({}))
      if (response.status === 401 || response.status === 403) {
        try { await boundedWait(() => this.onAuthorizationFailure(response.status), signal) } catch {}
      }
      if (Array.isArray(data.error?.errors) && data.error.errors.some(item => item?.reason === 'accessNotConfigured') || Array.isArray(data.error?.details) && data.error.details.some(item => item?.reason === 'SERVICE_DISABLED')) throw new Error('The regular Calendar API is disabled for Zyra’s Google project. Enable the Calendar API and reconnect.')
      if (response.status === 401) throw new Error('Google denied Calendar authorization. Reconnect this account.')
      if (response.status === 403) throw new Error('Google denied this Calendar operation. Check granted permission and account policy.')
      if (response.status === 404) throw new Error('Calendar could not find this calendar or event.')
      if (response.status === 409 || response.status === 412) throw new Error('Calendar event changed or conflicted. Read the current event before making another change.')
      throw new Error(`Calendar API rejected this request (HTTP ${response.status}).${mutation && response.status >= 500 ? ' The action result may be uncertain; no automatic retry was made. Inspect the calendar before retrying.' : ''}`)
    }
    try { return await responseJson(response, signal) }
    catch {
      throw new Error(mutation ? 'Google accepted this Calendar action, but its response could not be read. Inspect the calendar; do not repeat the action blindly.' : 'Calendar response could not be read, exceeded its size limit, or was cancelled.')
    }
  }
  async verifyAccount({ signal } = {}) {
    const active = this.signal(signal)
    const { scopes } = await this.access('permissions', active)
    if (calendarCapabilityGranted(scopes, 'calendarList')) await this.request('GET', 'users/me/calendarList', 'calendarList', { signal: active, query: { maxResults: 1, fields: 'items(id),nextPageToken' } })
    else if (calendarCapabilityGranted(scopes, 'eventsRead')) await this.request('GET', 'calendars/primary/events', 'eventsRead', { signal: active, query: { maxResults: 1, fields: 'items(id),nextPageToken' } })
    else if (calendarCapabilityGranted(scopes, 'freebusy')) {
      const start = this.now()
      if (!Number.isFinite(start)) throw new Error('Calendar verification clock is invalid.')
      const data = await this.request('POST', 'freeBusy', 'freebusy', { signal: active, body: { timeMin: new Date(start).toISOString(), timeMax: new Date(start + MINUTE).toISOString(), calendarExpansionMax: 1, items: [{ id: 'primary' }] } })
      busyIntervals(data, ['primary'])
    } else throw new Error('Google did not grant a Calendar permission allowing safe account verification. Reconnect; no event was created.')
    active.throwIfAborted()
    return { toolCount: CALENDAR_API_TOOLS.filter(tool => calendarCapabilityGranted(scopes, tool.capability)).length }
  }
  async listTools(_params, { signal } = {}) {
    const active = this.signal(signal)
    const { scopes } = await this.access('permissions', active)
    active.throwIfAborted()
    return { tools: CALENDAR_API_TOOLS.filter(tool => calendarCapabilityGranted(scopes, tool.capability)).map(({ capability, ...tool }) => tool) }
  }
  async callTool({ name, arguments: args = {} }, { signal } = {}) {
    const tool = CALENDAR_API_TOOLS.find(item => item.name === name)
    if (!tool) throw new Error('Unknown Calendar API tool.')
    let encoded
    try { encoded = JSON.stringify(args) } catch { throw new Error('Calendar arguments must be bounded JSON.') }
    if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > MAX_INPUT_BYTES) throw new Error('Calendar arguments exceed the 64 KiB input limit.')
    validateCalendarArguments(tool.inputSchema, args)
    const active = this.signal(signal)
    const { scopes } = await this.access(tool.capability, active)
    const base = `calendars/${calendarSegment(args.calendarId || 'primary')}/events`
    const path = args.eventId === undefined ? base : `${base}/${calendarSegment(args.eventId)}`
    const request = (method, destination, capability = tool.capability, body, query, headers) => this.request(method, destination, capability, { signal: active, body, query, headers })
    let data, mutationAccepted = false
    if (name === 'get_permissions') data = { backend: 'calendar-api', grantedScopes: scopes, capabilities: Object.fromEntries(Object.keys(CALENDAR_API_SCOPE_GROUPS).map(key => [key, calendarCapabilityGranted(scopes, key)])), chatPermissionsStillApply: true, permanentCalendarDeletionAvailable: false }
    else if (name === 'list_calendars') data = await request('GET', 'users/me/calendarList', 'calendarList', undefined, { maxResults: args.pageSize || 10, pageToken: args.pageToken })
    else if (name === 'get_event') data = await request('GET', path)
    else if (name === 'list_events' || name === 'search_events') {
      validWindow(args)
      data = await request('GET', base, 'eventsRead', undefined, { timeMin: args.startTime, timeMax: args.endTime, timeZone: args.timeZone, singleEvents: true, orderBy: 'startTime', maxResults: args.pageSize || 10, pageToken: args.pageToken, ...(name === 'search_events' ? { q: args.query } : {}) })
    } else if (name === 'suggest_time') {
      const { start, end } = validWindow(args, true)
      if (end - start > 31 * DAY || args.durationMinutes * MINUTE > end - start) throw new Error('Calendar suggestions require a window of at most 31 days containing the requested duration.')
      const ids = freebusyIds(args)
      preferenceCheck(args.timeZone, args.preferences)
      const freebusy = await request('POST', 'freeBusy', 'freebusy', { timeMin: args.startTime, timeMax: args.endTime, timeZone: args.timeZone, calendarExpansionMax: 10, groupExpansionMax: 1, items: ids.map(id => ({ id })) })
      data = await suggestions(args, busyIntervals(freebusy, ids), active)
    } else if (name === 'create_event') {
      const body = eventBody(args)
      data = await request('POST', base, 'eventsWrite', body, { sendUpdates: args.sendUpdates || 'all', ...(args.createGoogleMeet ? { conferenceDataVersion: 1 } : {}) })
      mutationAccepted = true
    } else {
      const prior = await request('GET', path, 'eventsRead')
      ordinary(prior)
      const headers = { 'if-match': safeEtag(prior) }, query = { sendUpdates: args.sendUpdates || 'all' }
      if (name === 'delete_event') {
        await request('DELETE', path, 'eventsWrite', undefined, query, headers)
        data = { deletedEventId: args.eventId, calendarId: args.calendarId || 'primary' }
      } else if (name === 'update_event') data = await request('PATCH', path, 'eventsWrite', eventBody(args, prior), query, headers)
      else if (name === 'respond_to_event') {
        const self = (prior.attendees || []).filter(item => item.self === true)
        if (self.length !== 1 || typeof self[0].email !== 'string' || !self[0].email) throw new Error('Calendar RSVP requires exactly one authenticated self attendee; none can be inferred.')
        data = await request('PATCH', path, 'eventsWrite', { attendees: [{ ...self[0], responseStatus: args.responseStatus }], attendeesOmitted: true }, query, headers)
      }
      mutationAccepted = true
    }
    const response = { content: [{ type: 'text', text: JSON.stringify(data) }] }
    if (Buffer.byteLength(JSON.stringify(response)) > MAX_RESULT_BYTES) throw new Error(mutationAccepted ? 'Google accepted this Calendar action, but its result exceeds the display limit. Inspect the calendar; do not repeat the action blindly.' : 'Calendar result exceeds the 256 KiB tool limit. Use a smaller page or read individual events.')
    if (active.aborted) throw new Error(mutationAccepted ? 'Google accepted this Calendar action before cancellation. Inspect the calendar; do not repeat the action blindly.' : 'Calendar operation was cancelled.')
    return response
  }
  async close() { this.controller.abort(new Error('Calendar connection closed.')) }
}
