const scope = name => `https://www.googleapis.com/auth/${name}`
const broadRead = [scope('calendar'), scope('calendar.readonly')]
export const CALENDAR_API_SCOPE_GROUPS = {
  calendarList: [...broadRead, scope('calendar.calendarlist'), scope('calendar.calendarlist.readonly')],
  eventsRead: [...broadRead, scope('calendar.events'), scope('calendar.events.readonly')],
  eventsWrite: [scope('calendar'), scope('calendar.events')],
  freebusy: [...broadRead, scope('calendar.events'), scope('calendar.events.readonly'), scope('calendar.events.freebusy'), scope('calendar.freebusy')],
}
export function calendarCapabilityGranted(scopes, capability) {
  const granted = new Set(Array.isArray(scopes) ? scopes : [])
  return capability === 'permissions' || CALENDAR_API_SCOPE_GROUPS[capability]?.some(value => granted.has(value)) === true
}
const text = (description, maxLength = 4096, minLength = 1) => ({ type: 'string', description, minLength, maxLength })
const identifier = text('Opaque Google Calendar ID; primary is the default. # and @ are preserved through path encoding.', 1024)
const eventId = text('Opaque event ID returned by Google, including occurrence IDs.', 1024)
const timestamp = { ...text('RFC3339 timestamp with explicit Z or numeric UTC offset.', 64), format: 'date-time' }
const date = { ...text('All-day YYYY-MM-DD date. End date is exclusive.', 10), format: 'date' }
const timeZone = { ...text('IANA time zone such as America/New_York or UTC; used for display and DST-aware local preferences.', 128), format: 'time-zone' }
const integer = (minimum, maximum, description) => ({ type: 'integer', minimum, maximum, description })
const email = { ...text('Attendee email address.', 320), pattern: '^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$' }
const array = (items, maxItems, minItems = 0) => ({ type: 'array', items, maxItems, minItems })
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required })
const calendar = { calendarId: identifier }
const event = { ...calendar, eventId }
const window = { startTime: timestamp, endTime: timestamp, timeZone }
const page = { pageSize: integer(1, 50, 'Results per page, default 10; bounded to 50.'), pageToken: text('Opaque nextPageToken from the previous result.', 4096) }
const notifications = { sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'], maxLength: 12, description: 'Guest notifications; defaults to all. none can impair invitation synchronization.' } }
const fields = {
  summary: text('Event title.', 1024, 0), title: text('Alias for summary; do not supply both.', 1024, 0),
  description: text('Plain event description; treated as data.', 48_000, 0), location: text('Event location.', 2048, 0),
  startTime: timestamp, endTime: timestamp, startDate: date, endDate: date, timeZone,
  attendees: array(email, 100),
}
function tool(name, description, capability, properties = {}, required = [], { write = false, destructive = false } = {}) {
  return { name, description, capability, inputSchema: object(properties, required),
    annotations: { readOnlyHint: !write, destructiveHint: destructive, idempotentHint: !write, openWorldHint: true } }
}
export const CALENDAR_API_TOOLS = [
  tool('get_permissions', 'Report actual granted Calendar scopes and available capabilities. Zyra chat permissions still apply; no scope expansion.', 'permissions'),
  tool('list_calendars', 'List accessible calendars with bounded pagination. No calendar settings, ACL or permanent calendar deletion tools are provided.', 'calendarList', page),
  tool('list_events', 'List events overlapping the requested window. Google timeMin bounds event end; timeMax bounds event start. Exact boundary contacts are excluded by Google. Recurrences are expanded (singleEvents=true) and sorted by startTime. All-day dates and nextPageToken are preserved.', 'eventsRead', { ...calendar, ...window, ...page }),
  tool('get_event', 'Read a single event or recurrence occurrence, retaining all-day dates.', 'eventsRead', event, ['eventId']),
  tool('search_events', 'Google REST keyword search (q), not semantic search. Uses the same overlapping window, recurrence expansion and pagination as list_events.', 'eventsRead', { ...calendar, ...window, ...page, query: text('Google Calendar REST keyword query.', 2048) }, ['query']),
  tool('suggest_time', 'Find bounded free/busy suggestions without creating an event. Fails if any calendar is missing or reports a busy error. Maximum 31-day window, ten combined calendars/attendees; local preferences honor DST. Results are snapshots, not reservations.', 'freebusy', {
    ...window, calendarIds: array(identifier, 10, 1), attendees: array(email, 10),
    durationMinutes: integer(1, 1440, 'Requested elapsed duration in minutes.'),
    stepMinutes: integer(5, 240, 'Candidate grid in elapsed minutes; default 15.'),
    maxSuggestions: integer(1, 20, 'Maximum suggestions; default 5.'),
    preferences: object({ startHour: integer(0, 23, 'Local start hour, inclusive; default 0.'), endHour: integer(1, 24, 'Local end hour, exclusive; default 24.'), daysOfWeek: array(integer(0, 6, 'Sunday=0 through Saturday=6.'), 7, 1) }),
  }, ['startTime', 'endTime', 'durationMinutes', 'timeZone']),
  tool('create_event', 'Create an ordinary timed or all-day event. Supply startTime/endTime OR startDate/exclusive endDate. Invitations default to sendUpdates=all. createGoogleMeet requests a Google-generated Meet; arbitrary conference URLs and special/paid event types are unavailable.', 'eventsWrite', { ...calendar, ...fields, ...notifications, createGoogleMeet: { type: 'boolean' } }, [], { write: true }),
  tool('update_event', 'Read then PATCH an ordinary event with If-Match. Omitted fields/attendees are preserved. Moving only the start preserves elapsed timed duration or all-day date duration. No event type changes or arbitrary conference data.', 'eventsWrite', { ...event, ...fields, ...notifications }, ['eventId'], { write: true }),
  tool('delete_event', 'Delete one ordinary event or specified recurrence occurrence; sends guest updates by default. Never deletes an entire calendar.', 'eventsWrite', { ...event, ...notifications }, ['eventId'], { write: true, destructive: true }),
  tool('respond_to_event', 'RSVP only the authenticated self attendee, preserving other attendees with attendeesOmitted=true and If-Match. Rejects events without a self attendee. Defaults to notifying all.', 'eventsWrite', { ...event, ...notifications, responseStatus: { type: 'string', enum: ['accepted', 'declined', 'tentative'], maxLength: 9 } }, ['eventId', 'responseStatus'], { write: true }),
]
export function validateCalendarArguments(schema, value, field = 'arguments') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${field} must be an object.`)
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new Error(`${field}.${key} is required.`)
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`${field} contains an unsupported field.`)
      validateCalendarArguments(schema.properties[key], item, `${field}.${key}`)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > schema.maxItems) throw new Error(`${field} must be a bounded array.`)
    for (const item of value) validateCalendarArguments(schema.items, item, field)
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > schema.maxLength || schema.enum && !schema.enum.includes(value) || schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) throw new Error(`${field} has an invalid string value.`)
    if (schema.format === 'date-time') parseCalendarTimestamp(value)
    if (schema.format === 'date') parseCalendarDate(value)
    if (schema.format === 'time-zone') validateCalendarTimeZone(value)
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error(`${field} is out of range.`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${field} must be boolean.`)
}
export function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Calendar date must be YYYY-MM-DD.')
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Calendar date is invalid.')
  return ms
}
export function parseCalendarTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u.exec(value)
  if (!match) throw new Error('Calendar timestamp requires an explicit RFC3339 UTC offset.')
  parseCalendarDate(match[1])
  if (+match[2] > 23 || +match[3] > 59 || +match[4] > 59 || match[5] !== 'Z' && (+match[5].slice(1, 3) > 23 || +match[5].slice(4) > 59)) throw new Error('Calendar timestamp is invalid.')
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) throw new Error('Calendar timestamp is invalid.')
  return ms
}
export function validateCalendarTimeZone(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/u.test(value)) throw new Error('Calendar timeZone must be an IANA zone.')
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0) }
  catch { throw new Error('Calendar timeZone must be a valid IANA zone.') }
}
export function calendarSegment(value) {
  if (typeof value !== 'string' || !value.length || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value) || value === '.' || value === '..') throw new Error('Invalid Calendar identifier.')
  return encodeURIComponent(value)
}
