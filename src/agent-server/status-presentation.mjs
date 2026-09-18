// Presentation only. Never use a cached status label to authorize a request.
export function formatAgentConnectionStatus(status, now = Date.now()) {
  if (!status) return "";
  const namespace = String(status.instance?.namespaceId || "").slice(0, 8);
  const channel = String(status.instance?.channel || 'service').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24);
  const source = namespace ? `${channel}/${namespace}` : "Service";
  const age = now - Date.parse(status.lastConfirmedAt || "");
  const live = status.connection === "connected" && Number.isFinite(age) && age >= -5000 && age < 45000;
  const state = live ? status.updatePending ? "live, update pending" : "live"
    : status.connection === "connecting" ? "connecting"
    : status.connection === "connected" ? "status stale" : "disconnected";
  return `${source}: ${state}`;
}
