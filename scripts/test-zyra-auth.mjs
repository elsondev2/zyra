#!/usr/bin/env node
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  chooseVerifiedApiModel,
  configureOpenAIApiKey,
  formatZyraAuthMethodsStatus,
  getZyraAuthMethodsStatus,
  normalizeZyraAuthMethod,
  removeZyraAuthMethod,
  verifyOpenAIApiKey,
} from "../src/auth-methods.mjs";
import { promptSecret } from "../src/secret-input.mjs";
import { loginZyraAuth, switchZyraAuthMethod } from "../src/zyra-sdk.mjs";
import { getSlashSuggestions } from "../src/slash-suggestions.mjs";
import { handleSlash } from "../src/slash-command-handlers.mjs";

class FakeAuthStorage {
  constructor() {
    this.values = new Map();
  }
  set(provider, credential) { this.values.set(provider, credential); }
  remove(provider) { this.values.delete(provider); }
  hasAuth(provider) { return this.values.has(provider); }
  getAuthStatus(provider) { return this.values.has(provider) ? { configured: true, source: "stored" } : { configured: false }; }
  async getApiKey(provider) { return this.values.get(provider)?.key; }
}

function response(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function testVerificationAndStorage() {
  const auth = new FakeAuthStorage();
  const requested = [];
  const verification = await configureOpenAIApiKey(auth, "sk-test-key", {
    fetch: async (url, init) => {
      requested.push({ url, authorization: init.headers.Authorization });
      return response(200, { id: "gpt-5.6-luna" });
    },
  });
  assert.equal(verification.targetModelAvailable, true);
  assert.equal(auth.values.get("openai")?.key, "sk-test-key");
  assert.equal(requested[0].url, "https://api.openai.com/v1/models/gpt-5.6-luna");
  assert.equal(requested[0].authorization, "Bearer sk-test-key");
  assert.equal(chooseVerifiedApiModel(verification), "openai/gpt-5.6-luna");
}

async function testInvalidKeyIsNotStored() {
  const auth = new FakeAuthStorage();
  await assert.rejects(
    () => configureOpenAIApiKey(auth, "sk-bad-key", { fetch: async () => response(401) }),
    /rejected this API key/i,
  );
  assert.equal(auth.hasAuth("openai"), false);
}

async function testValidKeyWithoutLunaFallsBack() {
  let calls = 0;
  const verification = await verifyOpenAIApiKey("sk-valid-key", {
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? response(404, { error: { message: "model missing" } })
        : response(200, { data: [{ id: "gpt-5.6-terra" }] });
    },
  });
  assert.equal(verification.targetModelAvailable, false);
  assert.equal(chooseVerifiedApiModel(verification), "openai/gpt-5.6-terra");
}

function testStatusAndRemoval() {
  const auth = new FakeAuthStorage();
  auth.set("openai-codex", { type: "oauth" });
  auth.set("openai", { type: "api_key", key: "hidden" });
  const status = getZyraAuthMethodsStatus(auth, { provider: "openai", id: "gpt-5.6-luna" });
  assert.equal(status.active, "api");
  assert.match(formatZyraAuthMethodsStatus(status), /subscription: connected \(stored\)/);
  assert.match(formatZyraAuthMethodsStatus(status), /API:\s+connected \(stored\)/);
  removeZyraAuthMethod(auth, "api");
  assert.equal(auth.hasAuth("openai"), false);
  assert.equal(normalizeZyraAuthMethod("chatgpt"), "subscription");
}

async function testBrowserFirstOAuthContract() {
  const auth = new FakeAuthStorage();
  let callbackContractChecked = false;
  auth.login = async (provider, callbacks) => {
    assert.equal(provider, "openai-codex");
    assert.equal(typeof callbacks.onSelect, "function");
    assert.equal(typeof callbacks.onDeviceCode, "function");
    assert.equal(typeof callbacks.onManualCodeInput, "function");
    assert.equal(await callbacks.onSelect({
      message: "Choose login",
      options: [
        { id: "device", label: "Device code" },
        { id: "browser", label: "Browser callback" },
      ],
    }), "browser");
    auth.set(provider, { type: "oauth" });
    callbackContractChecked = true;
  };
  const result = await loginZyraAuth("openai-codex", {
    authStorage: auth,
    onAuth: () => {},
    onMessage: () => {},
    onPrompt: async () => "manual-code",
  });
  assert.equal(callbackContractChecked, true);
  assert.equal(auth.hasAuth("openai-codex"), true);
  assert.equal(result.status.configured, true);
}

async function testSecretPromptMasksInput() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  input.resume = () => {};
  input.pause = () => {};
  const writes = [];
  const output = { isTTY: true, write: (value) => writes.push(String(value)) };
  const pending = promptSecret("OpenAI API key", { input, output });
  input.emit("keypress", "sk-secret", { name: undefined });
  input.emit("keypress", "", { name: "return" });
  assert.equal(await pending, "sk-secret");
  const rendered = writes.join("");
  assert.doesNotMatch(rendered, /sk-secret/);
  assert.match(rendered, /\*{9}/);
  assert.equal(input.isRaw, false);
}

async function testRuntimeSwitchesToVerifiedApiModel() {
  const auth = new FakeAuthStorage();
  auth.set("openai", { type: "api_key", key: "hidden" });
  const luna = { provider: "openai", id: "gpt-5.6-luna", name: "GPT-5.6 Luna" };
  const registry = {
    authStorage: auth,
    getAvailable: () => [luna],
  };
  const runtime = {
    session: {
      modelRegistry: registry,
      model: undefined,
      async setModel(model) { this.model = model; },
    },
  };
  const result = await switchZyraAuthMethod(runtime, "api", {
    authStorage: auth,
    verification: { targetModelAvailable: true, availableModelIds: ["gpt-5.6-luna"] },
  });
  assert.equal(result.method, "api");
  assert.equal(runtime.session.model, luna);
}

function testAuthMethodSuggestions() {
  const runtime = { session: {}, project: process.cwd() };
  assert.deepEqual(getSlashSuggestions(runtime, "/auth ").map((item) => item.value), ["subscription", "api"]);
  assert.deepEqual(getSlashSuggestions(runtime, "/login a").map((item) => item.value), ["api"]);
  assert.deepEqual(getSlashSuggestions(runtime, "/logout s").map((item) => item.value), ["subscription"]);
}

async function testSlashLoginApiEndToEnd() {
  const auth = new FakeAuthStorage();
  const luna = { provider: "openai", id: "gpt-5.6-luna", name: "GPT-5.6 Luna" };
  const runtime = {
    project: undefined,
    session: {
      modelRegistry: { authStorage: auth, getAvailable: () => [luna] },
      model: undefined,
      async setModel(model) { this.model = model; },
    },
  };
  const rendered = [];
  const ui = {
    async promptSecret() { return "secret-value"; },
    info(value) { rendered.push(String(value)); },
    block(lines) { rendered.push(...lines.map(String)); },
    beginProgress() {},
    endProgress() {},
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(200, { id: "gpt-5.6-luna" });
  try {
    assert.equal(await handleSlash(runtime, ui, "/login api"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(auth.hasAuth("openai"), true);
  assert.equal(runtime.session.model, luna);
  assert.match(rendered.join("\n"), /Using OpenAI API with openai\/gpt-5\.6-luna/);
  assert.doesNotMatch(rendered.join("\n"), /secret-value/);
}

async function testLogoutFallsBackToOtherConnectedMethod() {
  const auth = new FakeAuthStorage();
  auth.set("openai-codex", { type: "oauth" });
  auth.set("openai", { type: "api_key", key: "hidden" });
  const subscription = { provider: "openai-codex", id: "gpt-5.6-sol", name: "GPT-5.6 Sol" };
  const luna = { provider: "openai", id: "gpt-5.6-luna", name: "GPT-5.6 Luna" };
  const runtime = {
    session: {
      modelRegistry: { authStorage: auth, getAvailable: () => [subscription, luna] },
      model: subscription,
      async setModel(model) { this.model = model; },
    },
  };
  const rendered = [];
  const ui = {
    info(value) { rendered.push(String(value)); },
    block(lines) { rendered.push(...lines.map(String)); },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(200, { id: "gpt-5.6-luna" });
  try {
    assert.equal(await handleSlash(runtime, ui, "/logout subscription"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(auth.hasAuth("openai-codex"), false);
  assert.equal(runtime.session.model, luna);
  assert.match(rendered.join("\n"), /Switched to OpenAI API/);
}

await testVerificationAndStorage();
await testInvalidKeyIsNotStored();
await testValidKeyWithoutLunaFallsBack();
testStatusAndRemoval();
await testBrowserFirstOAuthContract();
await testSecretPromptMasksInput();
await testRuntimeSwitchesToVerifiedApiModel();
testAuthMethodSuggestions();
await testSlashLoginApiEndToEnd();
await testLogoutFallsBackToOtherConnectedMethod();
console.log("zyra auth method tests passed");
