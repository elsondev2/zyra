#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const privatePersonA = ["C", "ara"].join("");
const privatePersonB = ["E", "lson"].join("");
const privatePlatform = ["Inst", "agram"].join("");
const privatePlatformShort = ["I", "G"].join("");
const contextBundleTerm = ["ar", "chive"].join("");
const relationBoundaryTerm = ["friend", "ship", "-", "boundary"].join("");
const relationBoundaryTermSpaced = ["friend", "ship", " ", "boundary"].join("");
const relationTerm = ["ro", "mance"].join("");
const hiddenIntentTerm = ["hidden", " private ", "intent"].join("");

const checks = [
  {
    label: "private person A name",
    pattern: new RegExp(`\\b${escapeRegExp(privatePersonA)}\\b`, "i"),
  },
  {
    label: "private person B name",
    pattern: new RegExp(`\\b${escapeRegExp(privatePersonB)}\\b`, "i"),
  },
  {
    label: "private platform/context name",
    pattern: new RegExp(`\\b(?:${escapeRegExp(privatePlatform)}|${escapeRegExp(privatePlatformShort)})\\b`, "i"),
  },
  {
    label: "private interpretation wording",
    pattern: new RegExp(`${escapeRegExp(relationBoundaryTerm)}|${escapeRegExp(relationBoundaryTermSpaced)}|${escapeRegExp(relationTerm)}|${escapeRegExp(hiddenIntentTerm)}|score ${escapeRegExp(relationTerm)}`, "i"),
  },
  {
    label: "private context bundle wording",
    pattern: new RegExp(`${escapeRegExp(privatePersonA)}\\s+${escapeRegExp(contextBundleTerm)}|${escapeRegExp(contextBundleTerm)}\\s+safety|private\\s+${escapeRegExp(contextBundleTerm)}`, "i"),
  },
  {
    label: "local private Windows user path",
    pattern: new RegExp(`C:[\\\\/]+Users[\\\\/]+${escapeRegExp(privatePersonB)}`, "i"),
  },
  {
    label: "old private command/data path",
    pattern: new RegExp(`(?:^|[\\\\/_.-])${escapeRegExp(privatePersonA.toLowerCase())}(?:[\\\\/_.-]|$)`, "i"),
  },
  {
    label: "old personal outro key",
    pattern: new RegExp(`from${escapeRegExp(privatePersonB)}`, "i"),
  },
];

const files = gitFiles().filter(shouldScan);
const findings = [];

for (const file of files) {
  if (!existsSync(file)) continue;
  let text = "";
  try {
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    text = buffer.toString("utf8");
  } catch {
    continue;
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scannableLine = redactOpaqueLockIntegrity(file, line);
    for (const check of checks) {
      if (!check.pattern.test(scannableLine)) continue;
      findings.push({ file, line: index + 1, label: check.label, text: line.trim() });
    }
  }
}

if (findings.length) {
  console.error("privacy-check: found public private-context references\n");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} [${finding.label}] ${finding.text}`);
  }
  console.error("\nMove private context into ignored local .zyra/ files or rewrite it generically.");
  process.exit(1);
}

console.log("privacy-check: ok");

function gitFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean);
}

function redactOpaqueLockIntegrity(file, line) {
  if (file.endsWith("package-lock.json") || file.endsWith("npm-shrinkwrap.json")) {
    return line.replace(/("integrity"\s*:\s*")[^"]+("?)/g, "$1<integrity>$2");
  }
  if (file.endsWith("bun.lock") || file.endsWith("yarn.lock") || file.endsWith("pnpm-lock.yaml")) {
    return line.replace(/sha(?:256|512)-[A-Za-z0-9+/=_-]+/g, "<integrity>");
  }
  return line;
}

function shouldScan(file) {
  if (file === "scripts/privacy-check.mjs") return false;
  if (file.startsWith("node_modules/") || file.startsWith("dist/")) return false;
  if (/\.(png|jpe?g|gif|webp|ico|zip|sqlite|lockb)$/i.test(file)) return false;
  return true;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
