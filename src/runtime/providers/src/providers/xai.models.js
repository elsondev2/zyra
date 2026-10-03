// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/xai.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const XAI_MODELS = flattenModelCatalog("xai", values);
export {
  XAI_MODELS
};
