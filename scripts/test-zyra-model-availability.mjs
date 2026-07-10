import assert from "node:assert/strict";
import {
  checkModelAvailability,
  clearModelAvailabilityCache,
  getFilteredAvailableModels,
  refreshModelAvailability,
} from "../src/model-availability.mjs";

class FakeModelRegistry {
  constructor(models) {
    this.models = models;
  }

  getAvailable() {
    return this.models;
  }

  async getApiKeyAndHeaders() {
    return {
      ok: true,
      apiKey: buildFakeChatGptToken(),
      headers: { "x-test-auth": "ok" },
    };
  }
}

function buildFakeChatGptToken() {
  const payload = Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-test",
    },
  })).toString("base64url");
  return `header.${payload}.sig`;
}

function response(status, body) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

async function testUnavailableOpenAIModelIsFiltered() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai-codex", id: "gpt-dead", baseUrl: "https://chatgpt.com/backend-api" },
    { provider: "local", id: "dev-model" },
  ]);
  const report = await refreshModelAvailability(registry, {
    forceRefresh: true,
    fetch: async () => response(404, JSON.stringify({ error: { message: "The model gpt-dead does not exist." } })),
  });
  assert.deepEqual(report.removed.map((item) => item.key), ["openai-codex/gpt-dead"]);
  assert.deepEqual(getFilteredAvailableModels(registry).map((model) => `${model.provider}/${model.id}`), ["local/dev-model"]);
}

async function testTransientFailuresStayVisible() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai-codex", id: "gpt-slow", baseUrl: "https://chatgpt.com/backend-api" },
  ]);
  const result = await checkModelAvailability(registry, registry.getAvailable()[0], {
    forceRefresh: true,
    fetch: async () => response(503, "temporarily unavailable"),
  });
  assert.equal(result.availability, "unknown");
  assert.deepEqual(getFilteredAvailableModels(registry).map((model) => `${model.provider}/${model.id}`), ["openai-codex/gpt-slow"]);
}

async function testEmptyCodexStreamIsFiltered() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai-codex", id: "gpt-empty", baseUrl: "https://chatgpt.com/backend-api" },
  ]);
  const result = await checkModelAvailability(registry, registry.getAvailable()[0], {
    forceRefresh: true,
    fetch: async () => response(200, [
      "event: response.completed",
      "data: {\"type\":\"response.completed\",\"usage\":{\"output_tokens\":0}}",
      "",
    ].join("\n")),
  });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.reason, "empty_codex_response");
  assert.deepEqual(getFilteredAvailableModels(registry), []);
}

async function testCodexNotSupportedResponseIsFiltered() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai-codex", id: "gpt-not-supported", baseUrl: "https://chatgpt.com/backend-api" },
  ]);
  const result = await checkModelAvailability(registry, registry.getAvailable()[0], {
    forceRefresh: true,
    fetch: async () => response(400, JSON.stringify({
      detail: "The 'gpt-not-supported' model is not supported when using Codex with a ChatGPT account.",
    })),
  });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.reason, "upstream_http_400");
  assert.deepEqual(getFilteredAvailableModels(registry), []);
}

async function testCodexTextDeltaIsAvailable() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai-codex", id: "gpt-live", baseUrl: "https://chatgpt.com/backend-api" },
  ]);
  const result = await checkModelAvailability(registry, registry.getAvailable()[0], {
    forceRefresh: true,
    fetch: async () => response(200, [
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}",
      "",
    ].join("\n")),
  });
  assert.equal(result.availability, "available");
  assert.deepEqual(getFilteredAvailableModels(registry).map((model) => `${model.provider}/${model.id}`), ["openai-codex/gpt-live"]);
}

async function testOpenAIModelsEndpoint() {
  clearModelAvailabilityCache();
  const registry = new FakeModelRegistry([
    { provider: "openai", id: "gpt-live", baseUrl: "https://api.openai.com/v1" },
  ]);
  let requestedUrl = "";
  const result = await checkModelAvailability(registry, registry.getAvailable()[0], {
    forceRefresh: true,
    fetch: async (url) => {
      requestedUrl = url;
      return response(200, JSON.stringify({ id: "gpt-live" }));
    },
  });
  assert.equal(result.availability, "available");
  assert.equal(requestedUrl, "https://api.openai.com/v1/models/gpt-live");
}

await testUnavailableOpenAIModelIsFiltered();
await testTransientFailuresStayVisible();
await testEmptyCodexStreamIsFiltered();
await testCodexNotSupportedResponseIsFiltered();
await testCodexTextDeltaIsAvailable();
await testOpenAIModelsEndpoint();

console.log("zyra model availability tests passed");
