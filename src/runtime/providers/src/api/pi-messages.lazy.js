// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { lazyApi } from "./lazy.js";
const piMessagesApi = () => lazyApi(() => import("./pi-messages.js"));
export {
  piMessagesApi
};
