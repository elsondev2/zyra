// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import "./providers/images/register-builtins.js";
import { getImagesApiProvider } from "./images-api-registry.js";
function resolveImagesApiProvider(api) {
  const provider = getImagesApiProvider(api);
  if (!provider) {
    throw new Error(`No API provider registered for api: ${api}`);
  }
  return provider;
}
async function generateImages(model, context, options) {
  const provider = resolveImagesApiProvider(model.api);
  return provider.generateImages(model, context, options);
}
export {
  generateImages
};
