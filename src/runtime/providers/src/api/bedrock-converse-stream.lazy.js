// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { lazyApi } from "./lazy.js";
const importNodeOnlyApi = (specifier) => {
  const runtimeSpecifier = import.meta.url.endsWith(".js") ? specifier.replace(/\.ts$/, ".js") : specifier;
  return import(runtimeSpecifier);
};
let bedrockModuleOverride;
function setBedrockProviderModule(module) {
  bedrockModuleOverride = module;
}
const bedrockConverseStreamApi = () => lazyApi(
  async () => bedrockModuleOverride ?? await importNodeOnlyApi("./bedrock-converse-stream.js")
);
export {
  bedrockConverseStreamApi,
  setBedrockProviderModule
};
