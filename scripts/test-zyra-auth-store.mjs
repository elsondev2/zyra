import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  configureZyraOpenAIApiKey as configureSdkOpenAIApiKey,
  getZyraAuthOverview,
  getZyraAuthStatus as getSdkAuthStatus,
  logoutZyraAuth,
  removeZyraAuth as removeSdkAuth,
  verifyZyraOpenAIApiAuth as verifySdkOpenAIApiAuth,
} from "../src/zyra-sdk.mjs";
import {
  configureZyraOpenAIApiKey as configureDesktopOpenAIApiKey,
  getZyraAuthStatus as getDesktopAuthStatus,
  removeZyraAuth as removeDesktopAuth,
  verifyZyraOpenAIApiAuth as verifyDesktopOpenAIApiAuth,
} from "../src/desktop-openai-auth.mjs";
import { buildChatGptAccountStatus, resolveChatGptAccountAuth } from "../src/chatgpt-account.mjs";
import { createZyraRuntime } from "../src/zyra-runtime.mjs";
import {
  createZyraCredentialAuthStorage,
  createZyraCredentialAuthReader,
  migrateLegacyPiCredentials,
  readZyraStoredCredential,
  resolveZyraApiKeyCredential,
  ZyraCredentialStore,
} from "../src/zyra-auth-store.mjs";

const temporary = await mkdtemp(path.join(os.tmpdir(), "zyra-auth-store-"));
try {
  const authPath = path.join(temporary, "credentials", "auth.json");
  const first = new ZyraCredentialStore({ authPath });
  const second = new ZyraCredentialStore({ authPath });

  await first.modify("openai", async () => ({ type: "api_key", key: "fixture-api-key" }));
  await Promise.all([
    first.modify("anthropic", async () => ({ type: "api_key", key: "fixture-anthropic-key" })),
    second.modify("openai-codex", async () => ({ type: "oauth", access: "fixture-access", refresh: "fixture-refresh", expires: 1 })),
  ]);
  assert.deepEqual(second.read("openai"), { type: "api_key", key: "fixture-api-key" });
  assert.deepEqual(readZyraStoredCredential("openai-codex", authPath), {
    type: "oauth", access: "fixture-access", refresh: "fixture-refresh", expires: 1,
  });
  assert.equal(resolveZyraApiKeyCredential({ type: "api_key", key: "$ZYRA_TEST_API_KEY" }, { ZYRA_TEST_API_KEY: "fixture-env-key" }), "fixture-env-key");
  assert.equal(resolveZyraApiKeyCredential({ type: "api_key", key: "$ZYRA_MISSING_API_KEY" }, {}), undefined);
  assert.equal(resolveZyraApiKeyCredential({ type: "api_key", key: "fixture-direct-key" }, {}), "fixture-direct-key");
  const reader = await createZyraCredentialAuthReader({ authPath, migrateLegacy: false, env: { ZYRA_TEST_API_KEY: "fixture-env-key" } });
  assert.deepEqual(reader.getAuthStatus("openai"), { configured: true, source: "stored" });
  assert.deepEqual(reader.getAuthStatus("openai-codex"), { configured: true, source: "stored" });
  assert.deepEqual(reader.getAuthStatus("anthropic"), { configured: true, source: "stored" });
  assert.equal(reader.hasAuth("openai"), true);
  assert.equal(await reader.getApiKey("openai"), "fixture-api-key");
  const envReader = await createZyraCredentialAuthReader({
    authPath: path.join(temporary, "env-reader", "auth.json"),
    migrateLegacy: false,
    env: { OPENAI_API_KEY: "fixture-openai-env-key" },
  });
  assert.deepEqual(envReader.getAuthStatus("openai"), { configured: true, source: "environment" });
  assert.equal(await envReader.getApiKey("openai"), "fixture-openai-env-key");
  const nativeReadOptions = {
    authPath,
    legacyPiAuthPath: path.join(temporary, "missing-legacy-auth.json"),
  };
  assert.deepEqual(await getSdkAuthStatus("openai", nativeReadOptions), {
    provider: "openai", status: { configured: true, source: "stored" },
  });
  assert.deepEqual(await getDesktopAuthStatus("openai-codex", nativeReadOptions), {
    provider: "openai-codex", status: { configured: true, source: "stored" },
  });
  const overview = await getZyraAuthOverview(undefined, nativeReadOptions);
  assert.equal(overview.subscription.configured, true);
  assert.equal(overview.api.configured, true);
  const fakeFetch = async (url, request) => {
    assert.match(String(url), /\/models\//);
    assert.equal(request.headers.Authorization, "Bearer fixture-api-key");
    return new Response(null, { status: 200 });
  };
  assert.equal((await verifySdkOpenAIApiAuth({ ...nativeReadOptions, fetch: fakeFetch })).ok, true);
  assert.equal((await verifyDesktopOpenAIApiAuth({ ...nativeReadOptions, fetch: fakeFetch })).ok, true);
  const sdkMutationOptions = {
    authPath: path.join(temporary, "sdk-native-auth", "auth.json"),
    legacyPiAuthPath: path.join(temporary, "missing-sdk-legacy-auth.json"),
    fetch: fakeFetch,
  };
  assert.equal((await configureSdkOpenAIApiKey("fixture-api-key", sdkMutationOptions)).model, "openai/gpt-5.6-luna");
  assert.equal((await getSdkAuthStatus("openai", sdkMutationOptions)).status.configured, true);
  await logoutZyraAuth("openai", sdkMutationOptions);
  assert.equal((await getSdkAuthStatus("openai", sdkMutationOptions)).status.configured, false);
  const desktopMutationOptions = {
    authPath: path.join(temporary, "desktop-native-auth", "auth.json"),
    legacyPiAuthPath: path.join(temporary, "missing-desktop-legacy-auth.json"),
    fetch: fakeFetch,
  };
  assert.equal((await configureDesktopOpenAIApiKey("fixture-api-key", desktopMutationOptions)).model, "openai/gpt-5.6-luna");
  await removeDesktopAuth("api", desktopMutationOptions);
  assert.equal((await getDesktopAuthStatus("openai", desktopMutationOptions)).status.configured, false);
  await configureSdkOpenAIApiKey("fixture-api-key", sdkMutationOptions);
  await removeSdkAuth("api", sdkMutationOptions);
  assert.equal((await getSdkAuthStatus("openai", sdkMutationOptions)).status.configured, false);
  const oauthAuthPath = path.join(temporary, "native-codex-auth", "auth.json");
  const oauthCredentials = new ZyraCredentialStore({ authPath: oauthAuthPath });
  await oauthCredentials.modify("openai-codex", async () => ({
    type: "oauth",
    access: "fixture-expired-access",
    refresh: "fixture-refresh-token",
    expires: Date.now() - 1_000,
    accountId: "fixture-account-id",
  }));
  const oauthRequests = [];
  const tokenFetch = async (url, request) => {
    oauthRequests.push({ url: String(url), request });
    return new Response(JSON.stringify({
      access_token: "fixture-refreshed-access",
      refresh_token: "fixture-rotated-refresh",
      id_token: "fixture-id-token",
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const accountStatus = await buildChatGptAccountStatus("openai-codex", {
    authPath: oauthAuthPath,
    legacyPiAuthPath: path.join(temporary, "missing-codex-legacy-auth.json"),
    includeUsage: false,
    fetchImpl: tokenFetch,
    clientId: "zyra-fixture-client",
  });
  assert.equal(accountStatus.status.configured, true);
  assert.ok(Date.parse(accountStatus.tokenExpiresAt) > Date.now());
  assert.equal(oauthRequests.length, 1, "expired ChatGPT credentials refresh once without querying model APIs");
  assert.equal(oauthRequests[0].url, "https://auth.openai.com/oauth/token");
  assert.equal(oauthRequests[0].request.method, "POST");
  assert.equal(oauthRequests[0].request.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(oauthRequests[0].request.body)), {
    grant_type: "refresh_token",
    refresh_token: "fixture-refresh-token",
    client_id: "zyra-fixture-client",
  });
  const refreshedCredential = oauthCredentials.read("openai-codex");
  assert.equal(refreshedCredential.access, "fixture-refreshed-access");
  assert.equal(refreshedCredential.refresh, "fixture-rotated-refresh");
  assert.equal(refreshedCredential.idToken, "fixture-id-token");
  const resolvedAccountAuth = await resolveChatGptAccountAuth({
    authPath: oauthAuthPath,
    legacyPiAuthPath: path.join(temporary, "missing-codex-legacy-auth.json"),
    fetchImpl: tokenFetch,
    clientId: "zyra-fixture-client",
  });
  assert.equal(resolvedAccountAuth.accessToken, "fixture-refreshed-access");
  assert.equal(resolvedAccountAuth.source, "Zyra credential store");
  assert.equal(oauthRequests.length, 1, "valid refreshed credentials are reused without another token exchange");

  const runtimeOAuthPath = path.join(temporary, "native-runtime-oauth", "auth.json");
  const runtimeOAuthCredentials = new ZyraCredentialStore({ authPath: runtimeOAuthPath });
  await runtimeOAuthCredentials.modify("openai-codex", async () => ({
    type: "oauth", access: "runtime-expired-access", refresh: "runtime-refresh", expires: Date.now() - 1_000,
  }));
  const nativeRefreshRuntime = await createZyraRuntime({
    authPath: runtimeOAuthPath,
    modelsPath: path.join(temporary, "native-runtime-oauth", "models.json"),
    providerConfigPath: path.join(temporary, "native-runtime-oauth", "providers.json"),
    legacyPiAuthPath: path.join(temporary, "missing-runtime-legacy-auth.json"),
    loadSavedProviders: false,
    refreshOnCreate: false,
    fetchImpl: tokenFetch,
    oauthClientId: "zyra-fixture-client",
  });
  nativeRefreshRuntime.modelRuntime.getAuth = async () => {
    throw new Error("Pi must not refresh Zyra-owned ChatGPT credentials.");
  };
  assert.equal(await nativeRefreshRuntime.authStorage.getApiKey("openai-codex"), "fixture-refreshed-access");
  assert.equal(oauthRequests.length, 2, "the Pi compatibility facade resolves expired ChatGPT auth through Zyra's refresher");

  const concurrentAuthPath = path.join(temporary, "concurrent-codex-auth", "auth.json");
  const concurrentCredentials = new ZyraCredentialStore({ authPath: concurrentAuthPath });
  await concurrentCredentials.modify("openai-codex", async () => ({
    type: "oauth", access: "old-access", refresh: "shared-refresh", expires: Date.now() - 1_000,
  }));
  let concurrentRefreshCalls = 0;
  const slowTokenFetch = async () => {
    concurrentRefreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return new Response(JSON.stringify({
      access_token: "shared-new-access", refresh_token: "shared-new-refresh", expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [firstAuthReader, secondAuthReader] = await Promise.all([
    createZyraCredentialAuthReader({ authPath: concurrentAuthPath, migrateLegacy: false }),
    createZyraCredentialAuthReader({ authPath: concurrentAuthPath, migrateLegacy: false }),
  ]);
  const concurrentRefreshStorage1 = await createZyraCredentialAuthStorage({
    authPath: concurrentAuthPath, migrateLegacy: false, fetchImpl: slowTokenFetch, clientId: "zyra-fixture-client",
  });
  const concurrentRefreshStorage2 = await createZyraCredentialAuthStorage({
    authPath: concurrentAuthPath, migrateLegacy: false, fetchImpl: slowTokenFetch, clientId: "zyra-fixture-client",
  });
  assert.equal(firstAuthReader.getAuthStatus("openai-codex").configured, true);
  assert.equal(secondAuthReader.getAuthStatus("openai-codex").configured, true);
  const concurrentTokens = await Promise.all([
    concurrentRefreshStorage1.getApiKey("openai-codex"),
    concurrentRefreshStorage2.getApiKey("openai-codex"),
  ]);
  assert.deepEqual(concurrentTokens, ["shared-new-access", "shared-new-access"]);
  assert.equal(concurrentRefreshCalls, 1, "serialized credential updates prevent concurrent refresh-token rotation");

  const invalidAuthPath = path.join(temporary, "invalid-codex-auth", "auth.json");
  const invalidCredentials = new ZyraCredentialStore({ authPath: invalidAuthPath });
  await invalidCredentials.modify("openai-codex", async () => ({
    type: "oauth", access: "old-access", refresh: "invalid-refresh", expires: Date.now() - 1_000,
  }));
  const invalidStorage = await createZyraCredentialAuthStorage({
    authPath: invalidAuthPath,
    migrateLegacy: false,
    fetchImpl: async () => new Response("{}", { status: 401 }),
    clientId: "zyra-fixture-client",
  });
  await assert.rejects(
    invalidStorage.getApiKey("openai-codex"),
    (error) => error.code === "ZYRA_AUTH_REAUTH_REQUIRED",
  );
  assert.equal(invalidCredentials.read("openai-codex").refresh, "invalid-refresh", "failed refreshes preserve the credential for explicit re-login");
  const defaultClientAuthPath = path.join(temporary, "default-oauth-client", "auth.json");
  const defaultClientCredentials = new ZyraCredentialStore({ authPath: defaultClientAuthPath });
  await defaultClientCredentials.modify("openai-codex", async () => ({
    type: "oauth", access: "old-access", refresh: "unrefreshed-token", expires: Date.now() - 1_000,
  }));
  let defaultClientRequest;
  const defaultClientStorage = await createZyraCredentialAuthStorage({
    authPath: defaultClientAuthPath,
    migrateLegacy: false,
    env: {},
    fetchImpl: async (_url, request) => {
      defaultClientRequest = request;
      return new Response(JSON.stringify({
        access_token: "default-refreshed-access", refresh_token: "default-refreshed-token", expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(await defaultClientStorage.getApiKey("openai-codex"), "default-refreshed-access");
  assert.equal(new URLSearchParams(defaultClientRequest.body).get("client_id"), "app_EMoamEEZ73f0CkXaXp7hrann");
  assert.equal(defaultClientCredentials.read("openai-codex").refresh, "default-refreshed-token");

  const metadata = await second.list();
  assert.deepEqual(metadata.map((entry) => entry.providerId).sort(), ["anthropic", "openai", "openai-codex"]);
  assert.ok(metadata.every((entry) => !Object.hasOwn(entry, "key") && !Object.hasOwn(entry, "access")));
  if (process.platform !== "win32") assert.equal((await stat(authPath)).mode & 0o777, 0o600);

  const runtimeAuthPath = path.join(temporary, "runtime", "auth.json");
  const legacyAuthPath = path.join(temporary, "legacy-auth.json");
  await writeFile(legacyAuthPath, JSON.stringify({
    "openai-codex": { type: "oauth", access: "legacy-access", refresh: "legacy-refresh", expires: 2 },
  }));
  const noCopyAuthPath = path.join(temporary, "native-migration-default", "auth.json");
  const noCopyReader = await createZyraCredentialAuthReader({
    authPath: noCopyAuthPath,
    legacyPiAuthPath: legacyAuthPath,
  });
  assert.deepEqual(noCopyReader.getAuthStatus("openai-codex"), { configured: false, source: "none" });
  assert.equal(readZyraStoredCredential("openai-codex", noCopyAuthPath), undefined);
  await assert.rejects(
    migrateLegacyPiCredentials(new ZyraCredentialStore({ authPath: noCopyAuthPath }), noCopyAuthPath, legacyAuthPath),
    /explicit migration confirmation/,
  );
  const migratedReader = await createZyraCredentialAuthReader({
    authPath: path.join(temporary, "native-migration-confirmed", "auth.json"),
    legacyPiAuthPath: legacyAuthPath,
    confirmLegacyPiCredentialMigration: true,
  });
  assert.deepEqual(migratedReader.getAuthStatus("openai-codex"), { configured: true, source: "stored" });
  assert.deepEqual(migratedReader.get("openai-codex"), {
    type: "oauth", access: "legacy-access", refresh: "legacy-refresh", expires: 2,
  });
  const runtimeWithoutMigration = await createZyraRuntime({
    authPath: runtimeAuthPath,
    modelsPath: path.join(temporary, "models.json"),
    providerConfigPath: path.join(temporary, "providers.json"),
    legacyPiAuthPath: legacyAuthPath,
    loadSavedProviders: false,
    refreshOnCreate: false,
  });
  assert.equal(runtimeWithoutMigration.authStorage.get("openai-codex"), undefined);
  const confirmedRuntimeAuthPath = path.join(temporary, "runtime-confirmed", "auth.json");
  const runtime = await createZyraRuntime({
    authPath: confirmedRuntimeAuthPath,
    modelsPath: path.join(temporary, "models-confirmed.json"),
    providerConfigPath: path.join(temporary, "providers-confirmed.json"),
    legacyPiAuthPath: legacyAuthPath,
    confirmLegacyPiCredentialMigration: true,
    loadSavedProviders: false,
    refreshOnCreate: false,
  });
  assert.deepEqual(runtime.authStorage.get("openai-codex"), {
    type: "oauth", access: "legacy-access", refresh: "legacy-refresh", expires: 2,
  });
  runtime.modelRuntime.login = async () => { throw new Error("Pi auth login must not handle API keys."); };
  runtime.modelRuntime.logout = async () => { throw new Error("Pi auth logout must not handle credentials."); };
  await runtime.authStorage.loginApiKey("openai", "runtime-api-key");
  assert.deepEqual(runtime.authStorage.get("openai"), { type: "api_key", key: "runtime-api-key" });
  assert.equal(await runtime.authStorage.getApiKey("openai"), "runtime-api-key");
  const originalGetProviderAuthStatus = runtime.modelRuntime.getProviderAuthStatus;
  const originalHasConfiguredAuth = runtime.modelRuntime.hasConfiguredAuth;
  runtime.modelRuntime.getProviderAuthStatus = () => { throw new Error("Stored credential status must not depend on Pi."); };
  runtime.modelRuntime.hasConfiguredAuth = () => { throw new Error("Stored credential presence must not depend on Pi."); };
  assert.equal(runtime.authStorage.getAuthStatus("openai").configured, true);
  assert.equal(runtime.authStorage.hasAuth("openai"), true);
  assert.equal(runtime.authStorage.getAuthStatus("openai-codex").configured, true);
  assert.equal(runtime.authStorage.hasAuth("openai-codex"), true);
  runtime.modelRuntime.getProviderAuthStatus = originalGetProviderAuthStatus;
  runtime.modelRuntime.hasConfiguredAuth = originalHasConfiguredAuth;
  const persisted = JSON.parse(await readFile(confirmedRuntimeAuthPath, "utf8"));
  assert.equal(persisted.openai.key, "runtime-api-key");
  await runtime.authStorage.set("openai", { type: "api_key", key: "$ZYRA_TEST_API_KEY" });
  assert.equal(await runtime.authStorage.getApiKey("openai", { env: { ZYRA_TEST_API_KEY: "resolved-env-api-key" } }), "resolved-env-api-key");
  await runtime.authStorage.logout("openai");
  assert.equal(runtime.authStorage.hasAuth("openai"), false);

  await writeFile(authPath, "[]");
  assert.throws(() => first.read("openai"), /credential file is invalid/i);
  console.log("Zyra credential storage, migration, runtime integration, and redacted listing passed.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
