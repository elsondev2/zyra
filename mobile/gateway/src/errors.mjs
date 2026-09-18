export function fault(code, message) { return Object.assign(new Error(message), { code }); }
export function assert(condition, message) { if (!condition) throw fault('INVALID_REQUEST', message); }
export function publicError(error) {
  return { code: error?.code || 'REQUEST_FAILED', message: String(error?.message || 'Request failed.').slice(0, 1200) };
}
