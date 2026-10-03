// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/google.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const GOOGLE_MODELS = flattenModelCatalog("google", values);
export {
  GOOGLE_MODELS
};
