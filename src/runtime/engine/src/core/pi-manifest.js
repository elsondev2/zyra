// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { readFileSync } from "node:fs";
import { stripBom } from "../utils/text.js";
const RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"];
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readPiManifest(packageJsonPath) {
  try {
    const pkg = JSON.parse(stripBom(readFileSync(packageJsonPath, "utf-8")));
    if (!isObject(pkg)) {
      return null;
    }
    const resources = isObject(pkg.zyra) ? pkg.zyra : pkg.pi;
    if (!isObject(resources)) return null;
    const manifest = {};
    for (const field of RESOURCE_FIELDS) {
      const entries = resources[field];
      if (Array.isArray(entries) && entries.every((entry) => typeof entry === "string")) {
        manifest[field] = entries;
      }
    }
    return manifest;
  } catch {
    return null;
  }
}
export {
  readPiManifest
};
