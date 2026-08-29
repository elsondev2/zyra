export const ZYRA_AUTH_METHODS = Object.freeze(["subscription", "api"]);
export const ZYRA_SUBSCRIPTION_PROVIDER = "openai-codex";
export const ZYRA_API_PROVIDER = "openai";
export const ZYRA_SUBSCRIPTION_DEFAULT_MODEL = "openai-codex/gpt-5.6-sol";
export const ZYRA_API_DEFAULT_MODEL = "openai/gpt-5.6-luna";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const API_MODEL_PREFERENCE = Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);

export function normalizeZyraAuthMethod(value) {
  const method = String(value ?? "").trim().toLowerCase();
  if (["subscription", "codex", "chatgpt", "oauth", ZYRA_SUBSCRIPTION_PROVIDER].includes(method)) return "subscription";
  if (["api", "apikey", "api-key", ZYRA_API_PROVIDER].includes(method)) return "api";
  return undefined;
}

export function providerForZyraAuthMethod(method) {
  return normalizeZyraAuthMethod(method) === "api" ? ZYRA_API_PROVIDER : ZYRA_SUBSCRIPTION_PROVIDER;
}

export function authMethodForModel(model) {
  if (model?.provider === ZYRA_API_PROVIDER) return "api";
  if (model?.provider === ZYRA_SUBSCRIPTION_PROVIDER) return "subscription";
  return undefined;
}

export function getZyraAuthMethodsStatus(authStorage, model) {
  return {
    active: authMethodForModel(model),
    model: model?.provider && model?.id ? `${model.provider}/${model.id}` : undefined,
    subscription: buildProviderStatus(authStorage, ZYRA_SUBSCRIPTION_PROVIDER),
    api: buildProviderStatus(authStorage, ZYRA_API_PROVIDER),
  };
}

export function formatZyraAuthMethodsStatus(status = {}) {
  const active = status.active ? `${status.active}${status.model ? ` (${status.model})` : ""}` : "not selected";
  return [
    "Authentication",
    `  active:       ${active}`,
    `  subscription: ${formatProviderStatus(status.subscription)}`,
    `  API:          ${formatProviderStatus(status.api)}`,
    "  switch:       /auth subscription | /auth api",
  ].join("\n");
}

export async function verifyOpenAIApiKey(apiKey, options = {}) {
  const key = normalizeApiKey(apiKey);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw createAuthError("OpenAI API verification is unavailable in this runtime.", "fetch_unavailable");

  const baseUrl = String(options.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  const targetModel = String(options.targetModel ?? "gpt-5.6-luna");
  const headers = { Authorization: `Bearer ${key}`, accept: "application/json" };
  const targetResponse = await request(fetchImpl, `${baseUrl}/models/${encodeURIComponent(targetModel)}`, headers, options);

  if (targetResponse.ok) {
    await cancelBody(targetResponse);
    return { ok: true, targetModel, targetModelAvailable: true, availableModelIds: [targetModel] };
  }
  if (targetResponse.status === 401) {
    await cancelBody(targetResponse);
    throw createAuthError("OpenAI rejected this API key.", "invalid_api_key");
  }
  await cancelBody(targetResponse);

  if (![403, 404].includes(targetResponse.status)) {
    throw createAuthError(`OpenAI API verification failed with HTTP ${targetResponse.status}.`, "verification_failed");
  }

  const modelsResponse = await request(fetchImpl, `${baseUrl}/models`, headers, options);
  if (modelsResponse.status === 401) {
    await cancelBody(modelsResponse);
    throw createAuthError("OpenAI rejected this API key.", "invalid_api_key");
  }
  if (!modelsResponse.ok) {
    await cancelBody(modelsResponse);
    throw createAuthError(`OpenAI API verification failed with HTTP ${modelsResponse.status}.`, "verification_failed");
  }

  const availableModelIds = await readModelIds(modelsResponse);
  return {
    ok: true,
    targetModel,
    targetModelAvailable: availableModelIds.includes(targetModel),
    availableModelIds,
  };
}

export async function configureOpenAIApiKey(authStorage, apiKey, options = {}) {
  if (!authStorage?.set) throw createAuthError("Pi auth storage is unavailable.", "auth_storage_unavailable");
  const key = normalizeApiKey(apiKey);
  const verification = await verifyOpenAIApiKey(key, options);
  const model = chooseVerifiedApiModel(verification);
  if (!model) throw createAuthError("The API key is valid, but no supported GPT-5.6 API model is available to this account.", "unsupported_api_model");
  authStorage.set(ZYRA_API_PROVIDER, { type: "api_key", key });
  return { ...verification, model };
}

export function removeZyraAuthMethod(authStorage, method) {
  const normalized = normalizeZyraAuthMethod(method);
  if (!normalized) throw createAuthError("Auth method must be subscription or api.", "invalid_auth_method");
  const provider = providerForZyraAuthMethod(normalized);
  authStorage?.remove?.(provider);
  return { method: normalized, provider };
}

export function chooseVerifiedApiModel(verification = {}) {
  if (verification.targetModelAvailable) return ZYRA_API_DEFAULT_MODEL;
  const available = new Set(verification.availableModelIds ?? []);
  const model = API_MODEL_PREFERENCE.find((id) => available.has(id));
  return model ? `${ZYRA_API_PROVIDER}/${model}` : undefined;
}

function buildProviderStatus(authStorage, provider) {
  const raw = authStorage?.getAuthStatus?.(provider) ?? {};
  const configured = Boolean(authStorage?.hasAuth?.(provider) ?? raw.configured);
  return {
    configured,
    source: raw.source,
    label: raw.label,
  };
}

function formatProviderStatus(status = {}) {
  if (!status.configured) return "not connected";
  const source = status.label ?? status.source;
  return source ? `connected (${source})` : "connected";
}

function normalizeApiKey(value) {
  const key = String(value ?? "").trim();
  if (!key) throw createAuthError("OpenAI API key cannot be empty.", "missing_api_key");
  if (/\s/.test(key)) throw createAuthError("OpenAI API key cannot contain whitespace.", "invalid_api_key_format");
  return key;
}

async function request(fetchImpl, url, headers, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs ?? 15000);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000);
  try {
    return await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw createAuthError("OpenAI API verification timed out.", "verification_timeout");
    throw createAuthError("Could not reach OpenAI to verify the API key.", "verification_network_error");
  } finally {
    clearTimeout(timeout);
  }
}

async function readModelIds(response) {
  try {
    const payload = await response.json();
    return Array.isArray(payload?.data)
      ? payload.data.map((item) => String(item?.id ?? "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Verification only needs the status code.
  }
}

function createAuthError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
