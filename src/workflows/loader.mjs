import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractWorkflowMeta } from "./compiler.mjs";
import { normalizeWorkflowDefinition } from "./contracts.mjs";
import { validateWorkflowSource } from "./validator.mjs";

const PRECEDENCE = ["built-in", "personal", "project", "temporary"];

export async function discoverWorkflowDefinitions(options = {}) {
  const roots = [
    { origin: "built-in", dir: path.resolve(options.installRoot ?? path.resolve(import.meta.dirname, "../.."), "workflows"), trusted: true },
    { origin: "personal", dir: path.resolve(options.personalDir ?? path.join(os.homedir(), ".zyra", "workflows")), trusted: true },
    { origin: "project", dir: path.resolve(options.projectDir ?? path.join(options.project ?? process.cwd(), ".zyra", "workflows")), trusted: Boolean(options.projectTrusted) },
  ];
  const all = [];
  for (const root of roots) all.push(...await readRoot(root));
  for (const temporary of options.temporary ?? []) all.push(loadWorkflowRecord({ ...temporary, origin: "temporary", trusted: false, temporary: true }));
  const grouped = new Map();
  for (const entry of all) {
    const list = grouped.get(entry.definition.name) ?? [];
    list.push(entry);
    grouped.set(entry.definition.name, list);
  }
  const active = [];
  const shadowed = [];
  for (const variants of grouped.values()) {
    variants.sort((left, right) => PRECEDENCE.indexOf(right.definition.origin) - PRECEDENCE.indexOf(left.definition.origin));
    active.push(variants[0]);
    shadowed.push(...variants.slice(1).map((entry) => ({ ...entry, shadowedBy: variants[0].definition.file })));
  }
  active.sort((left, right) => left.definition.name.localeCompare(right.definition.name));
  return { active, shadowed, all };
}

export async function loadWorkflowFile(file, origin, trusted) {
  const source = await readFile(file, "utf8");
  return loadWorkflowRecord({ source, file, origin, trusted });
}

function loadWorkflowRecord(input) {
  const fallbackName = path.basename(input.file ?? "workflow.mjs", path.extname(input.file ?? "workflow.mjs"));
  const meta = extractWorkflowMeta(input.source, fallbackName);
  const validation = validateWorkflowSource(input.source);
  const definition = normalizeWorkflowDefinition({ ...meta, ...input, validation });
  return { definition, valid: validation.valid, runnable: validation.valid && (definition.origin !== "project" || definition.trusted), errors: validation.errors, warnings: validation.warnings };
}

async function readRoot(root) {
  if (!existsSync(root.dir)) return [];
  const files = (await readdir(root.dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && [".mjs", ".js"].includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(root.dir, entry.name)).sort();
  return Promise.all(files.map((file) => loadWorkflowFile(file, root.origin, root.trusted)));
}
