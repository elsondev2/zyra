import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const syntaxTargets = [
  "src/version.mjs",
  "src/agent-surface.mjs",
  "src/model-availability.mjs",
  "src/chatgpt-account.mjs",
  "src/web-search-tool.mjs",
  "src/web-tools-picker.mjs",
  "src/interrupt-mode-picker.mjs",
  "src/codex-usage-windows.mjs",
  "src/codex-reset-format.mjs",
  "src/codex-reset-picker.mjs",
  "src/onboarding.mjs",
  "src/clipboard-image.mjs",
  "src/slash-commands.mjs",
  "src/slash-command-handlers.mjs",
  "src/slash-suggestions.mjs",
  "src/status-line.mjs",
  "src/terminal-title.mjs",
  "src/zyra-ui.mjs",
  "src/zyra-ui-bridge.mjs",
  "src/file-change-lifecycle.mjs",
  "src/write-diff-tool.mjs",
  "src/terminal-input.mjs",
  "src/zyra-next-turn-checkpoint.mjs",
  "src/zyra-sdk.mjs",
  "src/zyra.mjs",
  "src/zyra-app.mjs",
  "src/zyra-memory.mjs",
  "src/memory/zyra-memory-state.mjs",
  "src/memory/zyra-memory-store.mjs",
  "src/memory/zyra-memory-bootstrap.mjs",
  "src/memory/zyra-memory-modes.mjs",
  "src/memory/zyra-memory-read.mjs",
  "src/memory/zyra-memory-phase2.mjs",
  "src/memory/zyra-memory-sessions.mjs",
  "src/memory/zyra-memory-stage1.mjs",
  "src/memory/zyra-memory-stage1-outputs.mjs",
  "src/memory/zyra-memory-worker-io.mjs",
  "src/memory/zyra-memory-worker-prompts.mjs",
  "src/memory/zyra-memory-workspace.mjs",
  "src/memory/zyra-memory-prompts.mjs",
  "src/memory/zyra-memory-runner.mjs",
  "src/memory/zyra-memory-controller.mjs",
  "src/tui/zyra-tui.mjs",
  "src/tui/component-host.mjs",
  "src/tui/render-utils.mjs",
  "src/tui/editor-input-layout.mjs",
  "src/tui/components/editor.mjs",
  "src/tui/components/message-components.mjs",
  "src/tui/components/static-panels.mjs",
  "scripts/check.mjs",
  "scripts/test-zyra-memory.mjs",
  "scripts/test-zyra-codex-mode.mjs",
  "scripts/test-zyra-codex-resets.mjs",
  "scripts/test-zyra-codex-usage-windows.mjs",
  "scripts/test-zyra-managed-bash.mjs",
  "scripts/test-zyra-model-availability.mjs",
  "scripts/test-zyra-prompt-errors.mjs",
  "scripts/test-zyra-write-diff.mjs",
  "scripts/test-zyra-version.mjs",
  "scripts/privacy-check.mjs",
];

const nodeTests = [
  "scripts/privacy-check.mjs",
  "scripts/test-agent-surface-contract.mjs",
  "scripts/test-zyra-memory.mjs",
  "scripts/test-zyra-codex-mode.mjs",
  "scripts/test-zyra-codex-resets.mjs",
  "scripts/test-zyra-codex-usage-windows.mjs",
  "scripts/test-zyra-managed-bash.mjs",
  "scripts/test-zyra-model-availability.mjs",
  "scripts/test-zyra-prompt-errors.mjs",
  "scripts/test-zyra-version.mjs",
  "scripts/test-zyra-ui-render.mjs",
  "scripts/test-zyra-subagents.mjs",
  "scripts/test-zyra-workflows.mjs",
  "scripts/test-zyra-fleet-ui.mjs",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[check] could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`[check] syntax (${syntaxTargets.length} files)`);
for (const target of syntaxTargets) run(process.execPath, ["--check", target]);

console.log(`[check] core tests (${nodeTests.length} suites)`);
for (const target of nodeTests) run(process.execPath, [target]);

function runBun(args) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "bun", ...args]);
    return;
  }
  run("bun", args);
}

console.log("[check] desktop suites");
runBun(["run", "--cwd", "desktop", "test:assistant-fleet"]);
runBun(["desktop/scripts/test-agent-platform-integration.ts"]);

console.log("[check] doctor");
run(process.execPath, ["bin/zyra.mjs", "doctor"]);
console.log("[check] complete");
