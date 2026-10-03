// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { readFileSync } from "node:fs";
function restoreSandboxEnv() {
  if (!process.versions?.bun) return;
  if (Object.keys(process.env).length > 0) return;
  try {
    const data = readFileSync("/proc/self/environ", "utf-8");
    for (const entry of data.split("\0")) {
      const idx = entry.indexOf("=");
      if (idx > 0) {
        process.env[entry.slice(0, idx)] = entry.slice(idx + 1);
      }
    }
  } catch {
  }
}
export {
  restoreSandboxEnv
};
