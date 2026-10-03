// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { lazyApi } from "./lazy.js";
const anthropicMessagesApi = () => lazyApi(() => import("./anthropic-messages.js"));
export {
  anthropicMessagesApi
};
