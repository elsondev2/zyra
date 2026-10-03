export const OPENAI_CODEX_AUTH_BASE_URL = "https://auth.openai.com";
export const OPENAI_CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const OPENAI_CODEX_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export function openAICodexCredentialNeedsRefresh(credential, options = {}) {
  if (credential?.type !== "oauth") return false;
  const now = Number(options.now ?? Date.now());
  const refreshWindowMs = Number(options.refreshWindowMs ?? OPENAI_CODEX_REFRESH_WINDOW_MS);
  const expires = Number(credential.expires);
  return !Number.isFinite(expires) || expires <= now + refreshWindowMs;
}

export function resolveOpenAICodexOAuthClientId(options = {}) {
  const clientId = String(options.clientId ?? OPENAI_CODEX_OAUTH_CLIENT_ID).trim();
  if (!clientId) throw new TypeError("OpenAI OAuth client ID cannot be empty.");
  return clientId;
}

export async function refreshOpenAICodexCredential(credential, options = {}) {
  if (credential?.type !== "oauth" || typeof credential.refresh !== "string" || !credential.refresh) {
    throw createAuthError("ChatGPT sign-in needs to be renewed.", "ZYRA_AUTH_REAUTH_REQUIRED");
  }
  const fetchImpl = options.fetchImpl ?? options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw createAuthError("ChatGPT token refresh is unavailable in this runtime.", "ZYRA_OAUTH_REFRESH_UNAVAILABLE");
  }

  const authBaseUrl = resolveOpenAICodexAuthBaseUrl(options.authBaseUrl);
  const clientId = resolveOpenAICodexOAuthClientId(options);

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs ?? 15_000);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000);
  try {
    const response = await fetchImpl(`${authBaseUrl}/oauth/token`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credential.refresh,
        client_id: clientId,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const requiresLogin = response.status === 400 || response.status === 401;
      throw createAuthError(
        requiresLogin
          ? "ChatGPT sign-in expired. Sign in again to reconnect the subscription."
          : `ChatGPT token refresh failed (HTTP ${response.status}).`,
        requiresLogin ? "ZYRA_AUTH_REAUTH_REQUIRED" : "ZYRA_OAUTH_REFRESH_FAILED",
      );
    }

    let tokens;
    try {
      tokens = await response.json();
    } catch (error) {
      throw createAuthError("ChatGPT returned an invalid token response.", "ZYRA_OAUTH_REFRESH_INVALID_RESPONSE", error);
    }
    const access = nonEmptyString(tokens?.access_token);
    const refresh = nonEmptyString(tokens?.refresh_token) ?? credential.refresh;
    const expiresIn = Number(tokens?.expires_in);
    if (!access || !refresh || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw createAuthError("ChatGPT returned an incomplete token response.", "ZYRA_OAUTH_REFRESH_INVALID_RESPONSE");
    }

    const now = Number(options.now ?? Date.now());
    const next = { ...credential, access, refresh, expires: now + expiresIn * 1000 };
    const idToken = nonEmptyString(tokens?.id_token);
    if (idToken) next.idToken = idToken;
    return next;
  } catch (error) {
    if (error?.code?.startsWith?.("ZYRA_")) throw error;
    if (controller.signal.aborted) {
      throw createAuthError("ChatGPT token refresh timed out.", "ZYRA_OAUTH_REFRESH_TIMEOUT", error);
    }
    throw createAuthError("Could not refresh the ChatGPT sign-in.", "ZYRA_OAUTH_REFRESH_NETWORK_ERROR", error);
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveOpenAICodexAuthBaseUrl(value) {
  const parsed = new URL(value ?? OPENAI_CODEX_AUTH_BASE_URL);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError("OpenAI Codex auth must use HTTPS, except for a local test server.");
  }
  return parsed.href.replace(/\/+$/, "");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function createAuthError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
