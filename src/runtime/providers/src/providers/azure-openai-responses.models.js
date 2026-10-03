// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/azure-openai-responses.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const AZURE_OPENAI_RESPONSES_MODELS = flattenModelCatalog("azure-openai-responses", values);
export {
  AZURE_OPENAI_RESPONSES_MODELS
};
