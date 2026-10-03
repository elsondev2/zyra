// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { stream, streamSimple } from "../../../../providers/src/compat.js";
import { LlamaClient, llamaInferenceUrl, normalizeLlamaServerUrl } from "./client.js";
const LLAMA_PROVIDER_ID = "llama.cpp";
const DEFAULT_LLAMA_SERVER_URL = "http://127.0.0.1:8080";
function credentialServerUrl(credential) {
  const value = credential?.env?.LLAMA_BASE_URL;
  return typeof value === "string" && value.trim() ? normalizeLlamaServerUrl(value) : void 0;
}
async function resolveServerUrl(ctx, credential) {
  const configured = credentialServerUrl(credential) ?? (await ctx.env("LLAMA_BASE_URL"))?.trim();
  return configured ? normalizeLlamaServerUrl(configured) : void 0;
}
function modelIsSelectable(model) {
  return model.status.value === "loaded" || model.status.value === "sleeping";
}
function toPiModel(model, serverUrl) {
  const reportedContextWindow = model.meta?.n_ctx ?? model.meta?.n_ctx_train;
  const contextWindow = reportedContextWindow && reportedContextWindow > 0 ? reportedContextWindow : 128e3;
  return {
    id: model.id,
    name: model.id,
    api: "openai-completions",
    provider: LLAMA_PROVIDER_ID,
    baseUrl: llamaInferenceUrl(serverUrl),
    reasoning: false,
    input: model.architecture?.input_modalities?.includes("image") ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: contextWindow,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      supportsStrictMode: false,
      maxTokensField: "max_tokens"
    }
  };
}
function createLlamaProvider() {
  let models = [];
  const setCatalog = (catalog, serverUrl) => {
    models = catalog.filter((model) => modelIsSelectable(model)).map((model) => toPiModel(model, serverUrl));
  };
  const provider = {
    id: LLAMA_PROVIDER_ID,
    name: "llama.cpp",
    baseUrl: llamaInferenceUrl(DEFAULT_LLAMA_SERVER_URL),
    auth: {
      apiKey: {
        name: "llama.cpp server",
        login: async (interaction) => {
          const enteredUrl = await interaction.prompt({
            type: "text",
            message: "llama.cpp server URL",
            placeholder: process.env.LLAMA_BASE_URL ?? DEFAULT_LLAMA_SERVER_URL
          });
          const serverUrl = normalizeLlamaServerUrl(
            enteredUrl.trim() || process.env.LLAMA_BASE_URL || DEFAULT_LLAMA_SERVER_URL
          );
          const apiKey = (await interaction.prompt({
            type: "secret",
            message: "API key (optional)"
          })).trim();
          await new LlamaClient(serverUrl, apiKey || void 0).list({ signal: interaction.signal });
          return {
            type: "api_key",
            key: apiKey || void 0,
            env: { LLAMA_BASE_URL: serverUrl }
          };
        },
        check: async ({ ctx, credential }) => {
          const serverUrl = await resolveServerUrl(ctx, credential);
          return serverUrl ? { type: "api_key", source: credential ? "stored credential" : "LLAMA_BASE_URL" } : void 0;
        },
        resolve: async ({ ctx, credential }) => {
          const serverUrl = await resolveServerUrl(ctx, credential);
          if (!serverUrl) return void 0;
          const apiKey = credential?.key ?? await ctx.env("LLAMA_API_KEY") ?? "local";
          return {
            auth: { apiKey, baseUrl: llamaInferenceUrl(serverUrl) },
            env: { ...credential?.env, LLAMA_BASE_URL: serverUrl },
            source: credential ? "stored credential" : "LLAMA_BASE_URL"
          };
        }
      }
    },
    getModels: () => models,
    refreshModels: async (context) => {
      if (context.stored) {
        const restored = context.stored.models.filter(
          (model) => model.provider === LLAMA_PROVIDER_ID && model.api === "openai-completions"
        );
        if (!await context.publish({
          update: () => {
            models = restored;
          }
        })) {
          return;
        }
      }
      if (!context.allowNetwork || context.signal.aborted || context.credential?.type !== "api_key") return;
      const serverUrl = credentialServerUrl(context.credential);
      if (!serverUrl) return;
      const catalog = await new LlamaClient(serverUrl, context.credential.key).list({ signal: context.signal });
      if (context.signal.aborted) return;
      const refreshed = catalog.filter((model) => modelIsSelectable(model)).map((model) => toPiModel(model, serverUrl));
      await context.publish({
        persist: { models: refreshed, checkedAt: Date.now() },
        update: () => {
          models = refreshed;
        }
      });
    },
    stream: (model, context, options) => stream(model, context, options),
    streamSimple: (model, context, options) => streamSimple(model, context, options)
  };
  return { provider, setCatalog };
}
export {
  DEFAULT_LLAMA_SERVER_URL,
  LLAMA_PROVIDER_ID,
  createLlamaProvider
};
