// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/qwen-token-plan.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const QWEN_TOKEN_PLAN_MODELS = flattenModelCatalog("qwen-token-plan", values);
export {
  QWEN_TOKEN_PLAN_MODELS
};
