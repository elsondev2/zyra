// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { EventEmitter } from "node:events";
import * as undici from "undici";
const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 3e5;
const DEFAULT_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2e3;
const HTTP_IDLE_TIMEOUT_CHOICES = [
  { label: "30 sec", timeoutMs: 3e4 },
  { label: "1 min", timeoutMs: 6e4 },
  { label: "2 min", timeoutMs: 12e4 },
  { label: "5 min", timeoutMs: 3e5 },
  { label: "disabled", timeoutMs: 0 }
];
const originalGlobalFetch = globalThis.fetch;
let installedGlobalFetch;
function parseHttpIdleTimeoutMs(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === "disabled") {
      return 0;
    }
    if (trimmed.length === 0) {
      return void 0;
    }
    return parseHttpIdleTimeoutMs(Number(trimmed));
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return void 0;
  }
  return Math.floor(value);
}
function formatHttpIdleTimeoutMs(timeoutMs) {
  const choice = HTTP_IDLE_TIMEOUT_CHOICES.find((item) => item.timeoutMs === timeoutMs);
  if (choice) {
    return choice.label;
  }
  return `${timeoutMs / 1e3} sec`;
}
function applyHttpProxySettings(httpProxy) {
  const proxy = httpProxy?.trim();
  if (!proxy) return;
  process.env.HTTP_PROXY ??= proxy;
  process.env.HTTPS_PROXY ??= proxy;
}
const ignoreUndiciDispatcherError = (_error) => {
};
function withUndiciErrorListener(dispatcher) {
  if (dispatcher instanceof EventEmitter) {
    EventEmitter.prototype.on.call(dispatcher, "error", ignoreUndiciDispatcherError);
  }
  return dispatcher;
}
function createUndiciClient(origin, options) {
  return withUndiciErrorListener(new undici.Client(origin, options));
}
function createUndiciOriginDispatcher(origin, options) {
  const dispatcherOptions = options;
  if (dispatcherOptions.connections === 1) {
    return createUndiciClient(origin, dispatcherOptions);
  }
  return withUndiciErrorListener(
    new undici.Pool(origin, {
      ...dispatcherOptions,
      factory: createUndiciClient
    })
  );
}
function configureHttpDispatcher(timeoutMs = DEFAULT_HTTP_IDLE_TIMEOUT_MS) {
  const normalizedTimeoutMs = parseHttpIdleTimeoutMs(timeoutMs);
  if (normalizedTimeoutMs === void 0) {
    throw new Error(`Invalid HTTP idle timeout: ${String(timeoutMs)}`);
  }
  const dispatcher = withUndiciErrorListener(
    new undici.EnvHttpProxyAgent({
      allowH2: false,
      bodyTimeout: normalizedTimeoutMs,
      connect: {
        autoSelectFamilyAttemptTimeout: DEFAULT_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS
      },
      headersTimeout: normalizedTimeoutMs,
      clientFactory: createUndiciClient,
      factory: createUndiciOriginDispatcher
    })
  );
  undici.setGlobalDispatcher(dispatcher);
  const shouldInstallGlobals = installedGlobalFetch === void 0 ? globalThis.fetch === originalGlobalFetch : globalThis.fetch === installedGlobalFetch;
  if (shouldInstallGlobals) {
    undici.install?.();
    installedGlobalFetch = globalThis.fetch;
  }
}
export {
  DEFAULT_HTTP_IDLE_TIMEOUT_MS,
  HTTP_IDLE_TIMEOUT_CHOICES,
  applyHttpProxySettings,
  configureHttpDispatcher,
  formatHttpIdleTimeoutMs,
  parseHttpIdleTimeoutMs
};
