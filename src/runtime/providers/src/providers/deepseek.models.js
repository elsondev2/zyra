// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/deepseek.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const DEEPSEEK_MODELS = flattenModelCatalog("deepseek", values);
export {
  DEEPSEEK_MODELS
};
