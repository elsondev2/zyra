// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { createRequire } from "node:module";
import * as path from "node:path";
import { getNativeModuleCandidates } from "./native-module-path.js";
const cjsRequire = createRequire(import.meta.url);
let nativeModifiersHelper;
function isNativeModifiersHelper(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value.isModifierPressed;
  return typeof candidate === "function";
}
function loadNativeModifiersHelper() {
  if (nativeModifiersHelper !== void 0) return nativeModifiersHelper ?? void 0;
  nativeModifiersHelper = null;
  const arch = process.arch;
  if (arch !== "x64" && arch !== "arm64") return void 0;
  let nativePath;
  if (process.platform === "darwin") {
    nativePath = path.join("native", "darwin", "prebuilds", `darwin-${arch}`, "darwin-modifiers.node");
  } else if (process.platform === "win32") {
    nativePath = path.join("native", "win32", "prebuilds", `win32-${arch}`, "win32-console-mode.node");
  } else {
    return void 0;
  }
  for (const modulePath of getNativeModuleCandidates(nativePath)) {
    try {
      const helper = cjsRequire(modulePath);
      if (isNativeModifiersHelper(helper)) {
        nativeModifiersHelper = helper;
        return helper;
      }
    } catch {
    }
  }
  return void 0;
}
function isNativeModifierPressed(key) {
  const helper = loadNativeModifiersHelper();
  if (!helper) return false;
  try {
    return helper.isModifierPressed(key) === true;
  } catch {
    return false;
  }
}
export {
  isNativeModifierPressed
};
