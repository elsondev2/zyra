/** Opt-in timing/count diagnostics. Never record prompts, paths or credentials. */
export function createRuntimeLatencyTrace(area, listener) {
  const enabled = typeof listener === 'function' || process.env.ZYRA_PERFORMANCE_TRACE === '1';
  const started = performance.now();
  let previous = started;
  return (phase, details = {}) => {
    if (!enabled) return;
    const now = performance.now();
    const values = Object.fromEntries(Object.entries(details).filter(([, value]) =>
      typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)));
    const metric = { area, phase, elapsedMs: Math.round(now - started), stageMs: Math.round(now - previous), ...values };
    previous = now;
    try {
      if (listener) listener(metric);
      else process.stderr.write(`[zyra-performance] ${JSON.stringify(metric)}\n`);
    } catch { /* Diagnostics cannot change runtime behavior. */ }
  };
}
