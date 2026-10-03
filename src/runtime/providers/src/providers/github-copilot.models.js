// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/github-copilot.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const GITHUB_COPILOT_MODELS = flattenModelCatalog("github-copilot", values);
export {
  GITHUB_COPILOT_MODELS
};
