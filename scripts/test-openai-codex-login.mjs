import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loginZyraAuth as loginDesktopZyraAuth } from "../src/desktop-openai-auth.mjs";
import { loginOpenAICodexAuth } from "../src/openai-codex-login.mjs";
import { OPENAI_CODEX_OAUTH_CLIENT_ID } from "../src/openai-codex-oauth.mjs";

const tokenResponse = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  id_token: createIdToken({
    "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account-id" },
  }),
  expires_in: 3600,
};

let browserCredential;
let browserTokenRequest;
let browserAuthUrl;
const browserResult = await loginOpenAICodexAuth({
  async loginOAuth(provider, credential) {
    assert.equal(provider, "openai-codex");
    browserCredential = credential;
  },
}, {
  authBaseUrl: "https://auth.fixture.invalid",
  callbackPort: 0,
  redirectHost: "127.0.0.1",
  now: 1_800_000_000_000,
  fetchImpl: async (url, request) => {
    assert.equal(String(url), "https://auth.fixture.invalid/oauth/token");
    browserTokenRequest = request;
    return jsonResponse(tokenResponse);
  },
  onAuth: async ({ url }) => {
    browserAuthUrl = new URL(url);
    assert.equal(browserAuthUrl.searchParams.get("client_id"), OPENAI_CODEX_OAUTH_CLIENT_ID);
    assert.equal(browserAuthUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(browserAuthUrl.searchParams.get("originator"), "zyra");
    const redirectUri = browserAuthUrl.searchParams.get("redirect_uri");
    const callback = await fetch(`${redirectUri}?code=fixture-auth-code&state=${browserAuthUrl.searchParams.get("state")}`);
    assert.equal(callback.status, 200);
    const callbackPage = await callback.text();
    assert.match(callbackPage, /ChatGPT/);
    assert.match(callbackPage, /<h1>You can return to Zyra<\/h1>/);
    assert.match(callbackPage, /Sign-in received/);
    assert.match(callbackPage, /data:image\/png;base64/);
    assert.match(callback.headers.get('content-security-policy'), /img-src data:/);
    assert.doesNotMatch(callbackPage, /fixture-auth-code/);
  },
});
assert.equal(browserResult.accountId, "fixture-account-id");
assert.equal(browserCredential.accountId, "fixture-account-id");
assert.equal(browserCredential.access, tokenResponse.access_token);
assert.equal(browserCredential.refresh, tokenResponse.refresh_token);
const browserForm = new URLSearchParams(browserTokenRequest.body);
assert.equal(browserTokenRequest.headers["Content-Type"], "application/x-www-form-urlencoded");
assert.equal(browserForm.get("grant_type"), "authorization_code");
assert.equal(browserForm.get("code"), "fixture-auth-code");
assert.equal(browserForm.get("client_id"), OPENAI_CODEX_OAUTH_CLIENT_ID);
assert.equal(browserForm.get("redirect_uri"), browserAuthUrl.searchParams.get("redirect_uri"));
assert.equal(
  createHash("sha256").update(browserForm.get("code_verifier")).digest("base64url"),
  browserAuthUrl.searchParams.get("code_challenge"),
);

let desktopCredential;
const desktopLoginResult = await loginDesktopZyraAuth("openai-codex", {
  authStorage: {
    async loginOAuth(provider, credential) {
      assert.equal(provider, "openai-codex");
      desktopCredential = credential;
    },
    getAuthStatus: () => ({ configured: true }),
  },
  clientId: "zyra-fixture-client",
  authBaseUrl: "https://auth.fixture.invalid",
  callbackPort: 0,
  redirectHost: "127.0.0.1",
  fetchImpl: async () => jsonResponse(tokenResponse),
  onAuth: async ({ url }) => {
    const authorization = new URL(url);
    const redirectUri = authorization.searchParams.get("redirect_uri");
    const callback = await fetch(`${redirectUri}?code=fixture-desktop-code&state=${authorization.searchParams.get("state")}`);
    assert.equal(callback.status, 200);
  },
});
assert.equal(desktopLoginResult.status.configured, true);
assert.equal(desktopCredential.accountId, "fixture-account-id");

const browserCancel = new AbortController();
let cancelledRedirectUri;
let cancelledBrowserWrites = 0;
await assert.rejects(loginOpenAICodexAuth({
  async loginOAuth() { cancelledBrowserWrites += 1; },
}, {
  clientId: "zyra-fixture-client",
  authBaseUrl: "https://auth.fixture.invalid",
  callbackPort: 0,
  signal: browserCancel.signal,
  onAuth: ({ url }) => {
    cancelledRedirectUri = new URL(url).searchParams.get("redirect_uri");
    browserCancel.abort();
  },
  fetchImpl: async () => { throw new Error("Cancelled login must not exchange a token."); },
}), (error) => error.code === "ZYRA_OAUTH_CANCELLED");
assert.equal(cancelledBrowserWrites, 0);
await assert.rejects(fetch(`${cancelledRedirectUri}?code=late-code&state=late-state`), "the cancelled callback listener must be closed");

let deviceCredential;
let deviceNow = 1_800_000_000_000;
let devicePolls = 0;
let deviceCodeInfo;
const deviceRequests = [];
const deviceResult = await loginOpenAICodexAuth({
  async loginOAuth(provider, credential) {
    assert.equal(provider, "openai-codex");
    deviceCredential = credential;
  },
}, {
  signInMethod: "device-code",
  clientId: "zyra-fixture-client",
  authBaseUrl: "https://auth.fixture.invalid",
  now: () => deviceNow,
  sleepImpl: async (milliseconds) => { deviceNow += milliseconds; },
  onDeviceCode: (info) => { deviceCodeInfo = info; },
  fetchImpl: async (url, request) => {
    deviceRequests.push({ url: String(url), request });
    if (String(url).endsWith("/api/accounts/deviceauth/usercode")) {
      return jsonResponse({ device_auth_id: "fixture-device-id", user_code: "ABCD-EFGH", interval: 1 });
    }
    if (String(url).endsWith("/api/accounts/deviceauth/token")) {
      devicePolls += 1;
      if (devicePolls === 1) return new Response("{}", { status: 403 });
      return jsonResponse({
        authorization_code: "fixture-device-code",
        code_challenge: "fixture-device-challenge",
        code_verifier: "fixture-device-verifier",
      });
    }
    assert.equal(String(url), "https://auth.fixture.invalid/oauth/token");
    const form = new URLSearchParams(request.body);
    assert.equal(form.get("code"), "fixture-device-code");
    assert.equal(form.get("code_verifier"), "fixture-device-verifier");
    assert.equal(form.get("redirect_uri"), "https://auth.fixture.invalid/deviceauth/callback");
    return jsonResponse(tokenResponse);
  },
});
assert.equal(devicePolls, 2);
assert.equal(deviceRequests.length, 4);
assert.equal(deviceCodeInfo.userCode, "ABCD-EFGH");
assert.equal(deviceCodeInfo.verificationUri, "https://auth.fixture.invalid/codex/device");
assert.equal(deviceResult.access, tokenResponse.access_token);
assert.equal(deviceCredential.accountId, "fixture-account-id");

const deviceCancel = new AbortController();
let cancelledDevicePolls = 0;
let cancelledDeviceWrites = 0;
await assert.rejects(loginOpenAICodexAuth({
  async loginOAuth() { cancelledDeviceWrites += 1; },
}, {
  signInMethod: "device-code",
  clientId: "zyra-fixture-client",
  authBaseUrl: "https://auth.fixture.invalid",
  signal: deviceCancel.signal,
  onDeviceCode: () => deviceCancel.abort(),
  fetchImpl: async (url) => {
    if (String(url).endsWith("/api/accounts/deviceauth/usercode")) {
      return jsonResponse({ device_auth_id: "cancelled-id", user_code: "CANCEL-ME" });
    }
    cancelledDevicePolls += 1;
    throw new Error("Cancelled device sign-in must not poll.");
  },
}), (error) => error.code === "ZYRA_OAUTH_CANCELLED");
assert.equal(cancelledDevicePolls, 0);
assert.equal(cancelledDeviceWrites, 0);

let invalidHostRequests = 0;
await assert.rejects(loginOpenAICodexAuth({ loginOAuth: async () => {} }, {
  clientId: "zyra-fixture-client",
  redirectHost: "login.attacker.invalid",
  fetchImpl: async () => { invalidHostRequests += 1; },
}), (error) => error.code === "ZYRA_OAUTH_REDIRECT_HOST_INVALID");
assert.equal(invalidHostRequests, 0, "invalid redirect hosts fail before listener or network setup");

console.log("native OpenAI browser and device-code login flows passed.");

function createIdToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `fixture.${payload}.signature`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
