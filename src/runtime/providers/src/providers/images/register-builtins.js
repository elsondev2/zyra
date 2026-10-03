// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { registerImagesApiProvider } from "../../images-api-registry.js";
let openRouterImagesProviderModulePromise;
function createLazyLoadErrorImages(model, error) {
  return {
    api: model.api,
    provider: model.provider,
    model: model.id,
    output: [],
    stopReason: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now()
  };
}
function loadOpenRouterImagesProviderModule() {
  openRouterImagesProviderModulePromise ||= import("../../api/openrouter-images.js").then(
    (module) => module
  );
  return openRouterImagesProviderModulePromise;
}
const generateImagesOpenRouter = async (model, context, options) => {
  try {
    const module = await loadOpenRouterImagesProviderModule();
    return await module.generateImages(model, context, options);
  } catch (error) {
    return createLazyLoadErrorImages(model, error);
  }
};
function registerBuiltInImagesApiProviders() {
  registerImagesApiProvider({
    api: "openrouter-images",
    generateImages: generateImagesOpenRouter
  });
}
registerBuiltInImagesApiProviders();
export {
  generateImagesOpenRouter,
  registerBuiltInImagesApiProviders
};
