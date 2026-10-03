// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import values from "./data/nvidia.json" with { type: "json" };
import { flattenModelCatalog } from "../model-catalog.js";
const NVIDIA_MODELS = flattenModelCatalog("nvidia", values);
export {
  NVIDIA_MODELS
};
