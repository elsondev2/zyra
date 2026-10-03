// Only the timestamp IDs minted by Zyra's bridge have this historical alias.
// Provider tool IDs and opaque external IDs must remain byte-for-byte intact.
export function normalizeCanonicalMessageSourceId(value) {
  return typeof value === 'string' ? value.replace(/^pi-message:(assistant|user):(\d+)$/, 'zyra-message:$1:$2') : value;
}
