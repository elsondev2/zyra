const phases = new Set(['idle', 'checking', 'waiting', 'restarting', 'ready', 'failed']);
const connections = new Set(['unknown', 'connecting', 'connected', 'disconnected']);
const text = (value, max = 160) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,128}$/.test(value) ? value : undefined;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;

// Phones get public identity and health, never tokens, paths or global sessions.
export function projectRuntimeStatus(value) {
  if (!value || typeof value !== 'object' || !phases.has(value.phase) || !connections.has(value.connection)) return undefined;
  const instance = value.instance && typeof value.instance === 'object' ? {
    instanceId: id(value.instance.instanceId), namespaceId: id(value.instance.namespaceId), channel: id(value.instance.channel),
    protocolVersion: Number.isSafeInteger(value.instance.protocolVersion) ? value.instance.protocolVersion : undefined,
    runtimeRevision: typeof value.instance.runtimeRevision === 'string' && /^[a-f0-9]{64}$/.test(value.instance.runtimeRevision) ? value.instance.runtimeRevision : null,
    startedAt: time(value.instance.startedAt)
  } : undefined;
  const installation = value.installation && ['development', 'installed', 'standalone'].includes(value.installation.kind) && text(value.installation.label)
    ? { kind: value.installation.kind, label: value.installation.label, ...(text(value.installation.appVersion) ? { appVersion: value.installation.appVersion } : {}) } : undefined;
  return {
    phase: value.phase, connection: value.connection,
    ...(time(value.lastConfirmedAt) ? { lastConfirmedAt: value.lastConfirmedAt } : {}),
    ...(typeof value.errorCode === 'string' && /^[A-Z0-9_]{1,96}$/.test(value.errorCode) ? { errorCode: value.errorCode } : {}),
    ...(value.updatePending === true ? { updatePending: true } : {}),
    ...(instance?.instanceId && instance.namespaceId ? { instance } : {}),
    ...(installation ? { installation } : {})
  };
}

export function mobileRuntimeStatus(clientStatus, configuredStatus) {
  return projectRuntimeStatus({ ...configuredStatus, ...clientStatus,
    updatePending: clientStatus?.updatePending === true || configuredStatus?.updatePending === true,
    installation: configuredStatus?.installation });
}
