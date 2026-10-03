// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/mistral.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const MISTRAL_MODELS = flattenModelCatalog("mistral", values);
export {
  MISTRAL_MODELS
};
