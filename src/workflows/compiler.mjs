import { assertValidWorkflowSource } from "./validator.mjs";

export function compileWorkflowSource(source, options = {}) {
  const validation = assertValidWorkflowSource(source, options);
  let body = String(source).replace(/^\uFEFF/, "");
  body = body.replace(/\bexport\s+const\s+meta\s*=/, "const meta =");
  body = body.replace(/\bexport\s+default\s+/, "return ");
  body = body.replace(/\bexport\s+\{[^}]*\}\s*;?/g, "");
  return {
    validation,
    code: [
      "(async () => {",
      '"use strict";',
      `const args = JSON.parse(${JSON.stringify(JSON.stringify(options.args ?? {}))});`,
      body,
      "})()",
    ].join("\n"),
  };
}

export function extractWorkflowMeta(source, fallbackName = "workflow") {
  const text = String(source ?? "");
  const metaBlock = findMetaObject(text);
  const name = matchString(metaBlock, "name") ?? fallbackName;
  const description = matchString(metaBlock, "description") ?? "";
  const version = matchNumber(metaBlock, "version") ?? 1;
  const phasesMatch = metaBlock.match(/\bphases\s*:\s*\[([\s\S]*?)\]/);
  const phases = phasesMatch ? [...phasesMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]) : [];
  const budgets = Object.fromEntries(["maxCalls", "maxRequests", "maxTokens", "maxCostUsd", "maxConcurrency"].flatMap((key) => {
    const value = matchNumber(metaBlock, key);
    return value === undefined ? [] : [[key, value]];
  }));
  return { version, name, description, phases, budgets };
}

function findMetaObject(source) {
  const startMatch = /\bexport\s+const\s+meta\s*=\s*\{/.exec(source);
  if (!startMatch) return "";
  const start = source.indexOf("{", startMatch.index);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (["'", '"', "`"].includes(char)) { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function matchString(source, key) {
  return source.match(new RegExp(`\\b${key}\\s*:\\s*["']([^"']+)["']`))?.[1];
}

function matchNumber(source, key) {
  const value = source.match(new RegExp(`\\b${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)`))?.[1];
  return value ? Number(value) : undefined;
}
