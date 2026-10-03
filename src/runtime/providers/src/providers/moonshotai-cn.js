// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { openAICompletionsApi } from "../api/openai-completions.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { MOONSHOTAI_CN_MODELS } from "./moonshotai-cn.models.js";
function moonshotaiCnProvider() {
  return createProvider({
    id: "moonshotai-cn",
    name: "Moonshot AI CN",
    baseUrl: "https://api.moonshot.cn/v1",
    auth: { apiKey: envApiKeyAuth("Moonshot AI API key", ["MOONSHOT_API_KEY"]) },
    models: Object.values(MOONSHOTAI_CN_MODELS),
    api: openAICompletionsApi()
  });
}
export {
  moonshotaiCnProvider
};
