// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { openAICompletionsApi } from "../api/openai-completions.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider } from "../models.js";
import { QWEN_TOKEN_PLAN_CN_MODELS } from "./qwen-token-plan-cn.models.js";
function qwenTokenPlanCnProvider() {
  return createProvider({
    id: "qwen-token-plan-cn",
    name: "Qwen Token Plan CN",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    auth: { apiKey: envApiKeyAuth("Qwen Token Plan CN API key", ["QWEN_TOKEN_PLAN_CN_API_KEY"]) },
    models: Object.values(QWEN_TOKEN_PLAN_CN_MODELS),
    api: openAICompletionsApi()
  });
}
export {
  qwenTokenPlanCnProvider
};
