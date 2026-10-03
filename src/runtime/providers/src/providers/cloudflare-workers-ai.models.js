// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/cloudflare-workers-ai.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const CLOUDFLARE_WORKERS_AI_MODELS = flattenModelCatalog("cloudflare-workers-ai", values);
export {
  CLOUDFLARE_WORKERS_AI_MODELS
};
