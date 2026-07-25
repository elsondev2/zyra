import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../agents/event-store.mjs";
import { stableJson } from "./contracts.mjs";

export function createWorkflowCallFingerprint(input = {}) {
  return createHash("sha256").update(stableJson({
    scriptHash: input.scriptHash,
    inputHash: hashValue(input.args),
    phase: input.phase,
    stableKey: input.stableKey,
    prompt: input.prompt,
    definitionRevision: input.definitionRevision,
    selectedModelPolicy: input.selectedModelPolicy,
    tools: input.tools,
    capabilities: input.capabilities,
    isolation: input.isolation,
    writeScope: input.writeScope,
    schema: input.schema,
  })).digest("hex");
}

export class WorkflowCache {
  constructor(directory) {
    this.directory = path.resolve(directory);
  }

  async get(fingerprint) {
    try {
      const record = JSON.parse(await readFile(this.file(fingerprint), "utf8"));
      return record?.fingerprint === fingerprint && record?.status === "completed" ? record : null;
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async put(fingerprint, value, metadata = {}) {
    await mkdir(this.directory, { recursive: true });
    const record = { fingerprint, status: "completed", value, metadata, completedAt: new Date().toISOString() };
    await atomicWrite(this.file(fingerprint), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  file(fingerprint) {
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid workflow cache fingerprint.");
    return path.join(this.directory, `${fingerprint}.json`);
  }
}

function hashValue(value) {
  return createHash("sha256").update(stableJson(value ?? null)).digest("hex");
}
