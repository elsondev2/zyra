// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const openrouterImagesApi = () => ({
  generateImages: async (model, context, options) => (await import("./openrouter-images.js")).generateImages(
    model,
    context,
    options
  )
});
export {
  openrouterImagesApi
};
