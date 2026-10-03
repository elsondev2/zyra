// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/openai.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const OPENAI_MODELS = flattenModelCatalog("openai", values);
export {
  OPENAI_MODELS
};
