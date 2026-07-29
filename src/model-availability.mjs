import { isPiSupportPending } from "./model-compatibility.mjs";

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PING_TIMEOUT_MS = 9000;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROBE_BODY_CHARS = 128 * 1024;
const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MODEL_UNAVAILABLE_RE = /\b(model|deployment|engine)\b.*\b(not found|does not exist|invalid|unknown|unavailable|unsupported|not supported|not available|decommissioned|retired|shutdown|sunset|access)/i;
const EMPTY_CODEX_RESPONSE_RE = /(?:event:\s*response\.completed|"type"\s*:\s*"response\.completed"|"type"\s*:\s*"response\.done"|data:\s*\[DONE\])/i;
const CODEX_TEXT_DELTA_RE = /(?:response\.output_text\.delta|"type"\s*:\s*"response\.output_text\.delta"|"delta"\s*:\s*"[^"]+)/i;
const TOKEN_USAGE_RE = /"(?:output_tokens|completion_tokens|total_tokens)"\s*:\s*[1-9]\d*/i;

const modelAvailabilityCache = new Map();

export function shouldPingModelAvailability(model) {
  return OPENAI_PROVIDERS.has(model?.provider);
}

export function getModelAvailabilityKey(model) {
  if (!model?.provider || !model?.id) return "";
  return `${model.provider}/${model.id}`;
}

export function clearModelAvailabilityCache() {
  modelAvailabilityCache.clear();
}

export function getFilteredAvailableModels(modelRegistry, options = {}) {
  return modelRegistry
    .getAvailable()
    .filter((model) => !isCachedUnavailable(model, options));
}

export function getCachedModelAvailability(model, options = {}) {
  const key = getModelAvailabilityKey(model);
  if (!key) return undefined;
  const cached = modelAvailabilityCache.get(key);
  if (!cached) return undefined;
  if (options.forceRefresh) return undefined;
  if (!isFresh(cached, options)) {
    modelAvailabilityCache.delete(key);
    return undefined;
  }
  return { ...cached, key };
}

export async function refreshModelAvailability(modelRegistry, options = {}) {
  const available = modelRegistry.getAvailable();
  const only = normalizeOnly(options.only);
  const targets = available.filter((model) => {
    if (!shouldPingModelAvailability(model)) return false;
    return only.size === 0 || only.has(getModelAvailabilityKey(model)) || only.has(model.id);
  });
  const checked = await Promise.all(targets.map((model) => checkModelAvailability(modelRegistry, model, options)));
  const filtered = getFilteredAvailableModels(modelRegistry, { ...options, forceRefresh: false });
  return {
    checked,
    filtered,
    blocked: checked.filter((item) => item.availability === "blocked"),
    removed: checked.filter((item) => item.availability === "unavailable"),
    unknown: checked.filter((item) => item.availability === "unknown"),
    available: checked.filter((item) => item.availability === "available"),
  };
}

export async function checkModelAvailability(modelRegistry, model, options = {}) {
  const key = getModelAvailabilityKey(model);
  if (!key) return buildResult(model, "unknown", "missing_model_id");

  if (!options.forceRefresh) {
    const cached = getCachedModelAvailability(model, options);
    if (cached) return buildResult(model, cached.availability, cached.reason, cached.httpStatus);
  }

  let result;
  try {
    if (isPiSupportPending(model)) {
      result = buildResult(model, "blocked", "pi_support_pending");
    } else if (!shouldPingModelAvailability(model)) {
      result = buildResult(model, "available", "provider_not_pinged");
    } else if (model.provider === "openai-codex") {
      result = await pingOpenAICodexModel(modelRegistry, model, options);
    } else {
      result = await pingOpenAIModel(modelRegistry, model, options);
    }
  } catch (error) {
    result = buildResult(model, "unknown", `ping_error:${error instanceof Error ? error.message : String(error)}`);
  }

  modelAvailabilityCache.set(key, {
    availability: result.availability,
    reason: result.reason,
    httpStatus: result.httpStatus,
    checkedAt: Date.now(),
  });
  return result;
}

export function formatModelAvailabilitySummary(report) {
  const checked = report?.checked?.length ?? 0;
  const removed = report?.removed ?? [];
  const blocked = report?.blocked ?? [];
  const unknown = report?.unknown ?? [];
  if (checked === 0) return "No OpenAI models needed a live ping.";
  const parts = [`Models checked: ${checked}`];
  parts.push(`removed: ${removed.length ? removed.map((item) => item.key).join(", ") : "none"}`);
  if (blocked.length > 0) {
    parts.push(`Pi support pending: ${blocked.map((item) => item.key).join(", ")}`);
  }
  if (unknown.length > 0) {
    parts.push(`kept without proof: ${unknown.map((item) => item.key).join(", ")}`);
  }
  return parts.join("; ");
}

async function pingOpenAIModel(modelRegistry, model, options = {}) {
  const auth = await getModelAuth(modelRegistry, model);
  if (!auth.ok) return buildResult(model, "unknown", `auth_unavailable:${auth.error ?? "unknown"}`);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return buildResult(model, "unknown", "fetch_unavailable");

  const response = await fetchWithTimeout(fetchImpl, resolveOpenAIModelUrl(model), {
    method: "GET",
    headers: {
      Authorization: auth.apiKey ? `Bearer ${auth.apiKey}` : undefined,
      ...auth.headers,
    },
  }, options);

  if (response.ok) {
    await cancelBody(response);
    return buildResult(model, "available", "models_endpoint_ok", response.status);
  }

  const text = await safeReadText(response);
  return classifyFailedResponse(model, response.status, text);
}

async function pingOpenAICodexModel(modelRegistry, model, options = {}) {
  const auth = await getModelAuth(modelRegistry, model);
  if (!auth.ok) return buildResult(model, "unknown", `auth_unavailable:${auth.error ?? "unknown"}`);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return buildResult(model, "unknown", "fetch_unavailable");

  const accountId = getChatGptAccountId(auth.apiKey);
  const response = await fetchWithTimeout(fetchImpl, resolveCodexResponsesUrl(model.baseUrl), {
    method: "POST",
    headers: {
      Authorization: auth.apiKey ? `Bearer ${auth.apiKey}` : undefined,
      ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      originator: "pi",
      "User-Agent": "pi (zyra model ping)",
      "OpenAI-Beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      ...auth.headers,
    },
    body: JSON.stringify({
      model: model.id,
      store: false,
      stream: true,
      instructions: "Reply with ok.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "ping" }],
        },
      ],
      text: { verbosity: "low" },
      include: ["reasoning.encrypted_content"],
      parallel_tool_calls: false,
    }),
  }, options);

  const text = await safeReadText(response, {
    timeoutMs: resolvePingTimeoutMs(options),
    stopWhen: isConclusiveCodexProbeText,
  });
  if (!response.ok) return classifyFailedResponse(model, response.status, text);
  return classifyCodexSuccess(model, response.status, text);
}

async function getModelAuth(modelRegistry, model) {
  if (typeof modelRegistry?.getApiKeyAndHeaders !== "function") {
    return { ok: false, error: "model registry cannot resolve request auth" };
  }
  return modelRegistry.getApiKeyAndHeaders(model);
}

async function fetchWithTimeout(fetchImpl, url, init, options = {}) {
  const timeoutMs = resolvePingTimeoutMs(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      headers: compactHeaders(init.headers),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolvePingTimeoutMs(options = {}) {
  const requested = Number(options.timeoutMs ?? process.env.ZYRA_MODEL_PING_TIMEOUT_MS ?? DEFAULT_PING_TIMEOUT_MS);
  return Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_PING_TIMEOUT_MS;
}

function isConclusiveCodexProbeText(text) {
  if (CODEX_TEXT_DELTA_RE.test(text) || TOKEN_USAGE_RE.test(text)) return true;
  if (looksLikeUnavailableModel(text) && /(?:response\.failed|"type"\s*:\s*"error"|"error"\s*:)/i.test(text)) return true;
  return /data:\s*\[DONE\]|"type"\s*:\s*"response\.(?:completed|done)"/i.test(text);
}

function classifyFailedResponse(model, httpStatus, text) {
  if (TRANSIENT_HTTP_STATUSES.has(httpStatus)) {
    return buildResult(model, "unknown", `transient_http_${httpStatus}`, httpStatus);
  }
  if (httpStatus === 401) return buildResult(model, "unknown", "auth_rejected", httpStatus);
  if ([400, 403, 404].includes(httpStatus) && looksLikeUnavailableModel(text)) {
    return buildResult(model, "unavailable", `upstream_http_${httpStatus}`, httpStatus);
  }
  if (httpStatus === 404) return buildResult(model, "unavailable", "upstream_http_404", httpStatus);
  return buildResult(model, "unknown", `upstream_http_${httpStatus}`, httpStatus);
}

function classifyCodexSuccess(model, httpStatus, text) {
  if (looksLikeUnavailableModel(text) && /(?:response\.failed|"type"\s*:\s*"error"|"error"\s*:)/i.test(text)) {
    return buildResult(model, "unavailable", "upstream_stream_error", httpStatus);
  }
  if (CODEX_TEXT_DELTA_RE.test(text) || TOKEN_USAGE_RE.test(text)) {
    return buildResult(model, "available", "codex_ping_ok", httpStatus);
  }
  if (EMPTY_CODEX_RESPONSE_RE.test(text)) {
    return buildResult(model, "unavailable", "empty_codex_response", httpStatus);
  }
  return buildResult(model, "unknown", "codex_ping_inconclusive", httpStatus);
}

function looksLikeUnavailableModel(text) {
  return MODEL_UNAVAILABLE_RE.test(String(text ?? ""));
}

function isCachedUnavailable(model, options = {}) {
  const cached = getCachedModelAvailability(model, options);
  return cached?.availability === "unavailable";
}

function isFresh(cached, options = {}) {
  if (options.forceRefresh) return false;
  const ttlMs = Number(options.ttlMs ?? process.env.ZYRA_MODEL_PING_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
  const ttl = Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : DEFAULT_CACHE_TTL_MS;
  return Date.now() - cached.checkedAt <= ttl;
}

function normalizeOnly(only) {
  const values = Array.isArray(only) ? only : only ? [only] : [];
  return new Set(values.map((value) => {
    if (typeof value === "string") return value.trim();
    return getModelAvailabilityKey(value);
  }).filter(Boolean));
}

function buildResult(model, availability, reason, httpStatus) {
  return {
    key: getModelAvailabilityKey(model),
    provider: model?.provider,
    model: model?.id,
    availability,
    reason,
    httpStatus,
  };
}

function resolveCodexResponsesUrl(baseUrl) {
  const normalized = String(baseUrl || DEFAULT_CODEX_BASE_URL).replace(/\/+$/, "");
  if (normalized.endsWith("/codex/responses")) return normalized;
  if (normalized.endsWith("/codex")) return `${normalized}/responses`;
  return `${normalized}/codex/responses`;
}

function resolveOpenAIModelUrl(model) {
  const baseUrl = String(model.baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "").replace(/\/responses$/i, "");
  return `${baseUrl}/models/${encodeURIComponent(model.id)}`;
}

function getChatGptAccountId(token) {
  const payload = decodeJwtPayload(token);
  return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id
    ?? payload?.["https://api.openai.com/auth.chatgpt_account_id"]
    ?? undefined;
}

function decodeJwtPayload(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length < 2) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function compactHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function safeReadText(response, options = {}) {
  const body = response?.body;
  if (!body || typeof body.getReader !== "function") {
    try {
      return await response.text();
    } catch (error) {
      return `read_error:${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const timeoutMs = resolvePingTimeoutMs(options);
  const deadline = Date.now() + timeoutMs;
  let text = "";

  try {
    while (text.length < MAX_PROBE_BODY_CHARS) {
      const remainingMs = Math.max(1, deadline - Date.now());
      let timeout;
      const result = await Promise.race([
        reader.read(),
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve({ timedOut: true }), remainingMs);
        }),
      ]);
      clearTimeout(timeout);

      if (result?.timedOut) {
        await reader.cancel("model availability probe timed out").catch(() => {});
        return text ? `${text}\nread_timeout` : "read_timeout";
      }
      if (result.done) {
        text += decoder.decode();
        return text;
      }

      text += decoder.decode(result.value, { stream: true });
      if (typeof options.stopWhen === "function" && options.stopWhen(text)) {
        await reader.cancel("model availability probe complete").catch(() => {});
        return text;
      }
    }

    await reader.cancel("model availability probe body limit reached").catch(() => {});
    return text;
  } catch (error) {
    return text || `read_error:${error instanceof Error ? error.message : String(error)}`;
  } finally {
    reader.releaseLock();
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Best-effort cleanup only.
  }
}
