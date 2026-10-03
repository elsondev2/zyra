// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { lazyApi } from "./lazy.js";
const googleVertexApi = () => lazyApi(() => import("./google-vertex.js"));
export {
  googleVertexApi
};
