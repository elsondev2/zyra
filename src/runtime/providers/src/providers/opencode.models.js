// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/opencode.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const OPENCODE_MODELS = flattenModelCatalog("opencode", values);
export {
  OPENCODE_MODELS
};
