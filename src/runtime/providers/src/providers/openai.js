// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { openAIResponsesApi } from "../api/openai-responses.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { OPENAI_MODELS } from "./openai.models.js";
function openaiProvider() {
  return createProvider({
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    auth: { apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]) },
    models: Object.values(OPENAI_MODELS),
    api: openAIResponsesApi()
  });
}
export {
  openaiProvider
};
