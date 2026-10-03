// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const moduleRequire = createRequire(import.meta.url);
const TUI_PACKAGE_NAME = "./index.js";
function getNativeModuleCandidates(nativePath, options = {}) {
  const moduleDir = dirname(fileURLToPath(options.moduleUrl ?? import.meta.url));
  const candidates = [];
  if (process.env.ZYRA_TERMINAL_NATIVE_DIR) candidates.push(join(process.env.ZYRA_TERMINAL_NATIVE_DIR, nativePath));
  try {
    const packageEntry = (options.resolvePackage ?? moduleRequire.resolve)(TUI_PACKAGE_NAME);
    candidates.push(join(dirname(packageEntry), "..", nativePath));
  } catch {
  }
  candidates.push(
    join(moduleDir, "..", nativePath),
    join(moduleDir, nativePath),
    join(dirname(options.execPath ?? process.execPath), nativePath)
  );
  return Array.from(new Set(candidates));
}
export {
  getNativeModuleCandidates
};
