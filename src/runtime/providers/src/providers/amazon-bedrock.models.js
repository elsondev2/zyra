// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/amazon-bedrock.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const AMAZON_BEDROCK_MODELS = flattenModelCatalog("amazon-bedrock", values);
export {
  AMAZON_BEDROCK_MODELS
};
