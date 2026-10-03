// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { createImagesModels } from "../images-models.js";
import { MODELS } from "../models.generated.js";
import { createModels } from "../models.js";
import { amazonBedrockProvider } from "./amazon-bedrock.js";
import { antLingProvider } from "./ant-ling.js";
import { anthropicProvider } from "./anthropic.js";
import { azureOpenAIResponsesProvider } from "./azure-openai-responses.js";
import { basetenProvider } from "./baseten.js";
import { cerebrasProvider } from "./cerebras.js";
import { cloudflareAIGatewayProvider } from "./cloudflare-ai-gateway.js";
import { cloudflareWorkersAIProvider } from "./cloudflare-workers-ai.js";
import modelDataManifest from "./data/.manifest.json" with { type: "json" };
import { deepseekProvider } from "./deepseek.js";
import { fireworksProvider } from "./fireworks.js";
import { githubCopilotProvider } from "./github-copilot.js";
import { googleProvider } from "./google.js";
import { googleVertexProvider } from "./google-vertex.js";
import { groqProvider } from "./groq.js";
import { huggingfaceProvider } from "./huggingface.js";
import { kimiCodingProvider } from "./kimi-coding.js";
import { minimaxProvider } from "./minimax.js";
import { minimaxCnProvider } from "./minimax-cn.js";
import { mistralProvider } from "./mistral.js";
import { moonshotaiProvider } from "./moonshotai.js";
import { moonshotaiCnProvider } from "./moonshotai-cn.js";
import { nvidiaProvider } from "./nvidia.js";
import { openaiProvider } from "./openai.js";
import { openaiCodexProvider } from "./openai-codex.js";
import { opencodeProvider } from "./opencode.js";
import { opencodeGoProvider } from "./opencode-go.js";
import { openrouterProvider } from "./openrouter.js";
import { openrouterImagesProvider } from "./openrouter-images.js";
import { qwenTokenPlanProvider } from "./qwen-token-plan.js";
import { qwenTokenPlanCnProvider } from "./qwen-token-plan-cn.js";
import { qwenTokenPlanIndividualProvider } from "./qwen-token-plan-individual.js";
import { radiusProvider } from "./radius.js";
import { togetherProvider } from "./together.js";
import { vercelAIGatewayProvider } from "./vercel-ai-gateway.js";
import { xaiProvider } from "./xai.js";
import { xiaomiProvider } from "./xiaomi.js";
import { xiaomiTokenPlanAmsProvider } from "./xiaomi-token-plan-ams.js";
import { xiaomiTokenPlanCnProvider } from "./xiaomi-token-plan-cn.js";
import { xiaomiTokenPlanSgpProvider } from "./xiaomi-token-plan-sgp.js";
import { zaiProvider } from "./zai.js";
import { zaiCodingCnProvider } from "./zai-coding-cn.js";
function getBuiltinModel(provider, modelId) {
  const models = MODELS[provider];
  return models?.[modelId];
}
function getBuiltinProviders() {
  return Object.keys(MODELS);
}
function getBuiltinModelDataGeneratedAt() {
  const generatedAt = Date.parse(modelDataManifest.generatedAt);
  return Number.isNaN(generatedAt) ? void 0 : generatedAt;
}
function getBuiltinModels(provider) {
  const models = MODELS[provider];
  return models ? Object.values(models) : [];
}
function builtinProviders() {
  return [
    amazonBedrockProvider(),
    antLingProvider(),
    anthropicProvider(),
    azureOpenAIResponsesProvider(),
    basetenProvider(),
    cerebrasProvider(),
    cloudflareAIGatewayProvider(),
    cloudflareWorkersAIProvider(),
    deepseekProvider(),
    fireworksProvider(),
    githubCopilotProvider(),
    googleProvider(),
    googleVertexProvider(),
    groqProvider(),
    huggingfaceProvider(),
    kimiCodingProvider(),
    minimaxProvider(),
    minimaxCnProvider(),
    mistralProvider(),
    moonshotaiProvider(),
    moonshotaiCnProvider(),
    nvidiaProvider(),
    openaiProvider(),
    openaiCodexProvider(),
    opencodeProvider(),
    opencodeGoProvider(),
    openrouterProvider(),
    qwenTokenPlanProvider(),
    qwenTokenPlanCnProvider(),
    qwenTokenPlanIndividualProvider(),
    togetherProvider(),
    vercelAIGatewayProvider(),
    xaiProvider(),
    xiaomiProvider(),
    xiaomiTokenPlanAmsProvider(),
    xiaomiTokenPlanCnProvider(),
    xiaomiTokenPlanSgpProvider(),
    zaiProvider(),
    zaiCodingCnProvider()
  ];
}
function builtinModels(options) {
  const models = createModels(options);
  for (const provider of builtinProviders()) {
    models.setProvider(provider);
  }
  return models;
}
function builtinImagesProviders() {
  return [openrouterImagesProvider()];
}
function builtinImagesModels(options) {
  const models = createImagesModels(options);
  for (const provider of builtinImagesProviders()) {
    models.setProvider(provider);
  }
  return models;
}
export {
  builtinImagesModels,
  builtinImagesProviders,
  builtinModels,
  builtinProviders,
  getBuiltinModel,
  getBuiltinModelDataGeneratedAt,
  getBuiltinModels,
  getBuiltinProviders,
  radiusProvider
};
