// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { NOOP_TELEMETRY_CONTEXT } from "./noop.js";
function defineTelemetrySchema(schema) {
  return schema;
}
function bindTypedSpanStarter(telemetryContext) {
  const startSpan = (name, attributes, callback) => telemetryContext.startSpan(
    { name, attributes },
    (span) => callback(
      span,
      bindTypedSpanStarter(span)
    )
  );
  return startSpan;
}
function createTypedSpanStarter(telemetryContext, _schemas) {
  return bindTypedSpanStarter(telemetryContext);
}
import { InMemoryTelemetryContext } from "./memory.js";
export {
  InMemoryTelemetryContext,
  NOOP_TELEMETRY_CONTEXT,
  createTypedSpanStarter,
  defineTelemetrySchema
};
