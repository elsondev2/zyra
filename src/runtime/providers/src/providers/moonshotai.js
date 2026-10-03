// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { openAICompletionsApi } from "../api/openai-completions.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { MOONSHOTAI_MODELS } from "./moonshotai.models.js";
function moonshotaiProvider() {
  return createProvider({
    id: "moonshotai",
    name: "Moonshot AI",
    baseUrl: "https://api.moonshot.ai/v1",
    auth: { apiKey: envApiKeyAuth("Moonshot AI API key", ["MOONSHOT_API_KEY"]) },
    models: Object.values(MOONSHOTAI_MODELS),
    api: openAICompletionsApi()
  });
}
export {
  moonshotaiProvider
};
