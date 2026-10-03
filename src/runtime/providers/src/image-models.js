// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { IMAGE_MODELS } from "./image-models.generated.js";
const imageModelRegistry = /* @__PURE__ */ new Map();
for (const [provider, models] of Object.entries(IMAGE_MODELS)) {
  const providerModels = /* @__PURE__ */ new Map();
  for (const [id, model] of Object.entries(models)) {
    providerModels.set(id, model);
  }
  imageModelRegistry.set(provider, providerModels);
}
function getImageModel(provider, modelId) {
  const providerModels = imageModelRegistry.get(provider);
  return providerModels?.get(modelId);
}
function getImageProviders() {
  return Array.from(imageModelRegistry.keys());
}
function getImageModels(provider) {
  const models = imageModelRegistry.get(provider);
  return models ? Array.from(models.values()) : [];
}
export {
  getImageModel,
  getImageModels,
  getImageProviders
};
