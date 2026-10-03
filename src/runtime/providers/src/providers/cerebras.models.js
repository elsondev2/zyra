// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/cerebras.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const CEREBRAS_MODELS = flattenModelCatalog("cerebras", values);
export {
  CEREBRAS_MODELS
};
