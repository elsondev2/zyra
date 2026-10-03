// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { createPlatformClipboard } from "./platform-clipboard.js";
function loadClipboardNative() {
  return createPlatformClipboard();
}
const clipboard = process.env.TERMUX_VERSION ? null : loadClipboardNative();
export {
  clipboard,
  loadClipboardNative
};
