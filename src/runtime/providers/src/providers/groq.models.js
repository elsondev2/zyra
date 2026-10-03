// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/groq.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const GROQ_MODELS = flattenModelCatalog("groq", values);
export {
  GROQ_MODELS
};
