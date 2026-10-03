// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/openai-codex.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const OPENAI_CODEX_MODELS = flattenModelCatalog("openai-codex", values);
export {
  OPENAI_CODEX_MODELS
};
