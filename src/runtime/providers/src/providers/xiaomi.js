// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { openAICompletionsApi } from "../api/openai-completions.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { XIAOMI_MODELS } from "./xiaomi.models.js";
function xiaomiProvider() {
  return createProvider({
    id: "xiaomi",
    name: "Xiaomi",
    baseUrl: "https://api.xiaomimimo.com/v1",
    auth: { apiKey: envApiKeyAuth("Xiaomi API key", ["XIAOMI_API_KEY"]) },
    models: Object.values(XIAOMI_MODELS),
    api: openAICompletionsApi()
  });
}
export {
  xiaomiProvider
};
