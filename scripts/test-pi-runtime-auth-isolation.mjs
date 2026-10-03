#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createZyraRuntime, resolveZyraAuthPath } from "../src/zyra-runtime.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "zyra-auth-isolation-"));
const piDirectory = path.join(root, "pi");
const zyraStateDirectory = path.join(root, "zyra-state");
const piAuthPath = path.join(piDirectory, "auth.json");
const zyraAuthPath = resolveZyraAuthPath({ stateDirectory: zyraStateDirectory });

try {
  await mkdir(piDirectory, { recursive: true });
  await writeFile(piAuthPath, JSON.stringify({ openai: { type: "api_key", key: "pi-only-fixture-key" } }));
  const previousPiDirectory = process.env.ZYRA_CODING_AGENT_DIR;
  process.env.ZYRA_CODING_AGENT_DIR = piDirectory;

  const runtime = await createZyraRuntime({ stateDirectory: zyraStateDirectory, modelsPath: null, allowModelNetwork: false, refreshOnCreate: false, loadSavedProviders: false, loadOpenAICatalog: false });
  assert.notEqual(zyraAuthPath, piAuthPath, "Zyra's auth file must never resolve to Pi's default auth file");
  assert.equal(runtime.authStorage.hasAuth("openai"), false, "An engine resource directory must not import credentials implicitly.");
  assert.equal(JSON.parse(await readFile(piAuthPath, "utf8")).openai.key, "pi-only-fixture-key", "Zyra must not modify Pi's credential file");
  await runtime.authStorage.set("openai", { type: "api_key", key: "zyra-only-fixture-key" });
  assert.equal(JSON.parse(await readFile(zyraAuthPath, "utf8")).openai.key, "zyra-only-fixture-key");

  await runtime.authStorage.logout("openai");
  const restarted = await createZyraRuntime({ stateDirectory: zyraStateDirectory, modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  assert.equal(restarted.authStorage.hasAuth("openai"), false, "a Zyra disconnect cannot import credentials from the engine resource directory");
  if (previousPiDirectory === undefined) delete process.env.ZYRA_CODING_AGENT_DIR;
  else process.env.ZYRA_CODING_AGENT_DIR = previousPiDirectory;
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Pi credential isolation: ok");
