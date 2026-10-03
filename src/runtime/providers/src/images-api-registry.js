// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const imagesApiProviderRegistry = /* @__PURE__ */ new Map();
function wrapGenerateImages(api, generateImages) {
  return (model, context, options) => {
    if (model.api !== api) {
      throw new Error(`Mismatched api: ${model.api} expected ${api}`);
    }
    return generateImages(model, context, options);
  };
}
function registerImagesApiProvider(provider, sourceId) {
  imagesApiProviderRegistry.set(provider.api, {
    provider: {
      api: provider.api,
      generateImages: wrapGenerateImages(provider.api, provider.generateImages)
    },
    sourceId
  });
}
function getImagesApiProvider(api) {
  return imagesApiProviderRegistry.get(api)?.provider;
}
export {
  getImagesApiProvider,
  registerImagesApiProvider
};
