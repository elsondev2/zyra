// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function startNoopSpan(_options, callback) {
  try {
    return Promise.resolve(callback(noopTelemetrySpan));
  } catch (error) {
    return Promise.reject(error);
  }
}
const noopTelemetrySpan = {
  startSpan: startNoopSpan,
  addEvent: () => {
  },
  setAttributes: () => {
  },
  setStatus: () => {
  }
};
Object.freeze(noopTelemetrySpan);
const NOOP_TELEMETRY_CONTEXT = noopTelemetrySpan;
export {
  NOOP_TELEMETRY_CONTEXT
};
