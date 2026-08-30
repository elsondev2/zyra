import catalog from "../../analytics/events.v1.json" with { type: "json" };

export const ANALYTICS_SCHEMA_VERSION = catalog.schemaVersion;
export const ANALYTICS_CATALOG_ID = catalog.catalogId;
export const ANALYTICS_EVENT_NAMES = Object.freeze(Object.keys(catalog.events));
export const ANALYTICS_ERROR_CODES = Object.freeze([...catalog.errorCodes]);

const eventNames = new Set(ANALYTICS_EVENT_NAMES);
const errorCodes = new Set(ANALYTICS_ERROR_CODES);
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9a-z.-]{1,64})?$/i;

export function isAnalyticsEventName(value) {
  return typeof value === "string" && eventNames.has(value);
}

export function sanitizeAnalyticsEvent(input, common = {}) {
  if (!input || typeof input !== "object" || !isAnalyticsEventName(input.event)) return null;
  const definition = catalog.events[input.event];
  const supplied = input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)
    ? input.properties
    : {};
  const properties = {};
  for (const [key, rule] of Object.entries({ ...catalog.commonProperties, ...definition.properties })) {
    const raw = Object.prototype.hasOwnProperty.call(supplied, key) ? supplied[key] : common[key];
    const value = sanitizeProperty(raw, rule);
    if (value !== undefined) properties[key] = value;
  }
  properties.schema_version = ANALYTICS_SCHEMA_VERSION;
  if (properties.source !== definition.owner) return null;
  if (Object.prototype.hasOwnProperty.call(definition.properties, "action") && typeof properties.action !== "string") return null;
  return Object.freeze({ event: input.event, properties: Object.freeze(properties) });
}

export function classifyModelFamily(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (/openai|gpt|codex/.test(normalized)) return "openai";
  if (/anthropic|claude/.test(normalized)) return "anthropic";
  if (/google|gemini/.test(normalized)) return "google";
  if (/groq/.test(normalized)) return "groq";
  if (/ollama|local|lmstudio/.test(normalized)) return "local";
  return "other";
}

export function classifyErrorCode(error) {
  const code = String(error?.code || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (errorCodes.has(code)) return code;
  const message = String(error?.message || error || "").toLowerCase();
  if (/abort|cancel|interrupt/.test(message)) return "aborted";
  if (/already|duplicate/.test(message)) return "already_active";
  if (/permission|denied|forbidden/.test(message)) return "permission_denied";
  if (/authori[sz]|oauth|credential|login/.test(message)) return "authorization_failed";
  if (/rate|429/.test(message)) return "rate_limited";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (/network|fetch|socket|offline/.test(message)) return "network_unavailable";
  if (/not found|enoent/.test(message)) return "not_found";
  if (/unavailable|not connected/.test(message)) return "unavailable";
  if (/invalid|malformed|required/.test(message)) return "invalid_input";
  return "unknown";
}

export function normalizeAnalyticsCommandName(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  const rule = catalog.events.zyra_v1_cli.properties.command;
  return rule.values.includes(normalized) ? normalized : "custom";
}

export function normalizeAnalyticsEffort(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "none") return "off";
  return ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(normalized)
    ? normalized
    : "unknown";
}

export function readAnalyticsCatalog() {
  return structuredClone(catalog);
}

function sanitizeProperty(value, rule) {
  switch (rule.type) {
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "integer": {
      const number = Number(value);
      if (!Number.isFinite(number)) return undefined;
      return Math.max(rule.min, Math.min(rule.max, Math.round(number)));
    }
    case "enum":
      return typeof value === "string" && rule.values.includes(value) ? value : undefined;
    case "error_code":
      return typeof value === "string" && errorCodes.has(value) ? value : undefined;
    case "safe_name": {
      const normalized = String(value || "").trim().toLowerCase();
      return SAFE_NAME_PATTERN.test(normalized) ? normalized : undefined;
    }
    case "version": {
      const normalized = String(value || "").trim();
      return VERSION_PATTERN.test(normalized) ? normalized : undefined;
    }
    default:
      return undefined;
  }
}
