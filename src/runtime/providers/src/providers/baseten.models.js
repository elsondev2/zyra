// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/baseten.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const BASETEN_MODELS = flattenModelCatalog("baseten", values);
export {
  BASETEN_MODELS
};
