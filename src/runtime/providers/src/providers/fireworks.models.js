// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/fireworks.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const FIREWORKS_MODELS = flattenModelCatalog("fireworks", values);
export {
  FIREWORKS_MODELS
};
