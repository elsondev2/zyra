import { Type } from "typebox";
import { CONTROL_CAPABILITIES } from "./contracts.mjs";

const capability = Type.Union(CONTROL_CAPABILITIES.map((entry) => Type.Literal(entry)));
const common = {
  operation: Type.String({ description: "Bounded control operation." }),
  targetId: Type.Optional(Type.String()),
  grantId: Type.Optional(Type.String()),
  observationRevision: Type.Optional(Type.Number()),
  elementRef: Type.Optional(Type.String()),
  includeScreenshot: Type.Optional(Type.Boolean()),
  capabilities: Type.Optional(Type.Array(capability, { maxItems: CONTROL_CAPABILITIES.length })),
  durationMs: Type.Optional(Type.Number()),
  maxActions: Type.Optional(Type.Number()),
  allowedOrigins: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  allowedExecutableIdentities: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  url: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  replace: Type.Optional(Type.Boolean()),
  key: Type.Optional(Type.String()),
  modifiers: Type.Optional(Type.Array(Type.String(), { maxItems: 8 })),
  deltaX: Type.Optional(Type.Number()),
  deltaY: Type.Optional(Type.Number()),
  values: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })),
  condition: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number()),
  sideEffect: Type.Optional(Type.String()),
};

export const browserControlSchema = Type.Object(common, { additionalProperties: false });
export const computerControlSchema = Type.Object(common, { additionalProperties: false });

export const BROWSER_CONTROL_OPERATIONS = Object.freeze([
  "list_targets", "request_grant", "observe", "navigate", "click", "type", "key", "scroll", "select", "wait", "release",
]);
export const COMPUTER_CONTROL_OPERATIONS = Object.freeze([
  "list_windows", "request_grant", "observe", "focus", "click", "type", "key", "scroll", "wait", "release",
]);
