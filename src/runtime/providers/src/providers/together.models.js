// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/together.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const TOGETHER_MODELS = flattenModelCatalog("together", values);
export {
  TOGETHER_MODELS
};
