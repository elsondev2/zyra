// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { lazyApi } from "./lazy.js";
const openAICompletionsApi = () => lazyApi(() => import("./openai-completions.js"));
export {
  openAICompletionsApi
};
