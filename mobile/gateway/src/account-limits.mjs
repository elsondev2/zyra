import { assert } from './errors.mjs';
const label = value => typeof value === 'string' ? value.slice(0, 100) : '';
export function projectAccountLimits(overview) {
  overview = overview?.overview || overview;
  const epochSeconds = value => Number.isFinite(value) && value > 0 ? Math.floor(value > 100_000_000_000 ? value / 1000 : value) : null;
  const windows = value => ['primary', 'secondary'].flatMap(kind => {
    const source = value?.[kind];
    if (!source || !Number.isFinite(source.usedPercent)) return [];
    const usedPercent = Math.min(100, Math.max(0, source.usedPercent));
    return [{ kind, usedPercent, remainingPercent: 100 - usedPercent,
      durationMinutes: Number.isFinite(source.windowDurationMins) && source.windowDurationMins > 0 ? source.windowDurationMins : null,
      resetsAt: epochSeconds(source.resetsAt) }];
  });
  let sources = Object.entries(overview?.rateLimitsByLimitId || {}).slice(0, 16);
  if (!sources.some(([, value]) => windows(value).length)) sources = overview?.rateLimits ? [['default', overview.rateLimits]] : [];
  if (!sources.some(([, value]) => windows(value).length)) sources = (overview?.usage?.limitWindows || []).slice(0, 32).map((entry, index) => [entry.id || String(index), {
    limitName: entry.scope || entry.label || 'Codex', primary: { usedPercent: entry.usedPercent,
      windowDurationMins: Number.isFinite(entry.windowSeconds) ? entry.windowSeconds / 60 : null, resetsAt: entry.resetAt }
  }]);
  const groups = sources.flatMap(([id, value]) => { const projected = windows(value); return projected.length ? [{ id: label(id), label: label(value?.limitName) || 'Codex', windows: projected }] : []; });
  const fetchedAt = overview?.fetchedAt || overview?.usage?.updatedAt;
  return { available: groups.length > 0, groups, fetchedAt: typeof fetchedAt === 'string' && Number.isFinite(Date.parse(fetchedAt)) ? fetchedAt : null,
    ...(!groups.length && (overview?.usageError || overview?.requiresOpenaiAuth || overview?.status?.configured === false) ? {
      unavailableReason: overview?.requiresOpenaiAuth || overview?.status?.configured === false ? 'Connect your account in Zyra Desktop to view its limits.' : 'The account provider could not return limits. Refresh or check Account on the PC.'
    } : {}) };
}
export async function readAccountLimits(load) {
  assert(load, 'Update Zyra Desktop to view limits on this phone.');
  try { return projectAccountLimits(await load()); }
  catch { throw new Error('Usage limits are unavailable on this computer. Open Account on the PC to check its connection.'); }
}
