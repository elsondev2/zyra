// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/huggingface.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const HUGGINGFACE_MODELS = flattenModelCatalog("huggingface", values);
export {
  HUGGINGFACE_MODELS
};
