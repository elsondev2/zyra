#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatZyraVersion, isZyraVersionRequest } from "../src/version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src", "zyra.mjs");
const args = process.argv.slice(2);

if (process.env.ZYRA_STANDALONE === "1") {
  process.env.ZYRA_CALLER_CWD ??= process.cwd();
  await runStandalone(args);
} else if (isZyraVersionRequest(args)) {
  process.stdout.write(`${formatZyraVersion()}\n`);
  process.exit(0);
} else {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      ZYRA_CALLER_CWD: process.env.ZYRA_CALLER_CWD ?? process.cwd(),
    },
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

async function runStandalone(runtimeArgs) {
  const mode = runtimeArgs[0];
  if (mode === "--internal-agent-server") {
    const { runZyraAgentServer } = await import("../src/agent-server/main.mjs");
    await runZyraAgentServer(runtimeArgs.slice(1));
    return;
  }
  if (mode === "--internal-agent-bridge") {
    await import("../src/zyra-ui-bridge.mjs");
    return;
  }
  if (mode === "--internal-workflow-sandbox") {
    await import("../src/workflows/sandbox-worker.mjs");
    return;
  }
  if (mode === "--internal-standalone-oauth-smoke") {
    const expectedToken = String(process.env.ZYRA_STANDALONE_OAUTH_SMOKE_TOKEN ?? "");
    if (!expectedToken) throw new Error("Standalone OAuth smoke token is missing.");
    const { createZyraAuthStorage } = await import("../src/pi-runtime.mjs");
    const authStorage = await createZyraAuthStorage({
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const accessToken = await authStorage.getApiKey("openai-codex");
    if (accessToken !== expectedToken) throw new Error("Standalone OAuth smoke resolved the wrong credential.");
    process.stdout.write("standalone OAuth bundle smoke passed\n");
    return;
  }
  await import("../src/zyra.mjs");
}
