import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateAgentDefinition } from "./definition-validator.mjs";

export const DEFINITION_PRECEDENCE = Object.freeze(["built-in", "personal", "project", "session"]);

export async function discoverAgentDefinitions(options = {}) {
  const roots = [
    { source: "built-in", dir: path.resolve(options.installRoot ?? path.resolve(import.meta.dirname, "../.."), "agents"), trusted: true },
    { source: "personal", dir: path.resolve(options.personalDir ?? path.join(os.homedir(), ".zyra", "agents")), trusted: true },
    { source: "project", dir: path.resolve(options.projectDir ?? path.join(options.project ?? process.cwd(), ".zyra", "agents")), trusted: Boolean(options.projectTrusted) },
  ];
  const entries = [];
  for (const root of roots) entries.push(...await readDefinitionDirectory(root));
  for (const override of options.sessionOverrides ?? []) {
    entries.push(normalizeLoadedDefinition({ ...override, source: "session", trusted: true, file: override.file ?? "<session>" }));
  }

  const byName = new Map();
  for (const entry of entries) {
    const name = entry.definition?.name ?? entry.name;
    if (!name) continue;
    const current = byName.get(name) ?? [];
    current.push(entry);
    byName.set(name, current);
  }

  const active = [];
  const shadowed = [];
  for (const [name, variants] of byName) {
    variants.sort((left, right) => precedenceRank(right.source) - precedenceRank(left.source));
    const selected = variants[0];
    active.push({ ...selected, name, runnable: selected.valid && selected.definition.enabled && selected.trusted });
    for (const entry of variants.slice(1)) shadowed.push({ ...entry, name, shadowedBy: selected.file });
  }
  active.sort((left, right) => left.name.localeCompare(right.name));
  return { active, shadowed, all: entries, loadedAt: new Date().toISOString() };
}

export async function loadAgentDefinitionFile(file, source = "project", options = {}) {
  const text = await readFile(file, "utf8");
  const parsed = parseMarkdownDefinition(text);
  return normalizeLoadedDefinition({ ...parsed, file, source, trusted: options.trusted ?? source !== "project" });
}

export function parseMarkdownDefinition(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  if (!source.startsWith("---")) return { metadata: {}, prompt: source.trim() };
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { metadata: {}, prompt: source.trim(), parseError: "unterminated frontmatter" };
  try {
    return { metadata: parseSimpleYaml(match[1]), prompt: match[2].trim() };
  } catch (error) {
    return { metadata: {}, prompt: match[2].trim(), parseError: error instanceof Error ? error.message : String(error) };
  }
}

export function serializeAgentDefinition(definition) {
  const fields = {
    version: definition.version ?? 1,
    name: definition.name,
    description: definition.description,
    role: definition.role,
    model: definition.model?.requested ?? definition.model ?? "inherit",
    effort: definition.effort,
    tools: definition.tools,
    disallowedTools: definition.disallowedTools,
    permissionMode: definition.permissionMode,
    background: definition.background,
    isolation: definition.isolation,
    readScope: definition.readScope,
    writeScope: definition.writeScope,
    maxTurns: definition.maxTurns,
    color: definition.color,
    skills: definition.skills,
  };
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || (Array.isArray(value) && !value.length)) continue;
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }
  lines.push("---", "", String(definition.prompt ?? "").trim(), "");
  return lines.join("\n");
}

async function readDefinitionDirectory(root) {
  if (!existsSync(root.dir)) return [];
  const files = (await readdir(root.dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(root.dir, entry.name))
    .sort();
  return Promise.all(files.map((file) => loadAgentDefinitionFile(file, root.source, { trusted: root.trusted })));
}

function normalizeLoadedDefinition(input) {
  const metadata = input.metadata ?? input;
  const validated = validateAgentDefinition({ ...metadata, prompt: input.prompt ?? metadata.prompt });
  const errors = [...validated.errors];
  if (input.parseError) errors.unshift(input.parseError);
  return {
    file: input.file,
    source: input.source,
    trusted: Boolean(input.trusted),
    valid: errors.length === 0,
    definition: validated.definition,
    name: validated.definition.name,
    errors,
    warnings: validated.warnings,
  };
}

function parseSimpleYaml(text) {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`Invalid frontmatter line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    result[key] = parseYamlValue(line.slice(separator + 1).trim());
  }
  return result;
}

function parseYamlValue(value) {
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try { return JSON.parse(value.replace(/'/g, '"')); } catch { return value.slice(1, -1).split(",").map((entry) => stripQuotes(entry.trim())).filter(Boolean); }
  }
  return stripQuotes(value);
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function formatYamlValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string" && /[:#\[\]{},]/.test(value)) return JSON.stringify(value);
  return String(value);
}

function precedenceRank(source) {
  return DEFINITION_PRECEDENCE.indexOf(source);
}
