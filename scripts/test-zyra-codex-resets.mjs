import assert from "node:assert/strict";
import {
  isCodexResetCreditAvailable,
  normalizeCodexResetCredits,
  normalizeCodexResetRedemption,
} from "../src/zyra-sdk.mjs";
import {
  createCodexResetConfirmationDialog,
  createCodexResetSelectionDialog,
} from "../src/codex-reset-picker.mjs";
import { runCodexResets } from "../src/slash-command-handlers.mjs";
import { getSlashCommand } from "../src/slash-commands.mjs";
import { dispatchTerminalKeypress } from "../src/terminal-input.mjs";
import { ZyraComponentHost } from "../src/tui/component-host.mjs";
import { stripAnsi } from "../src/tui/render-utils.mjs";
import { runZyraInputDialog } from "../src/zyra-ui.mjs";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const available = {
  id: "credit-available",
  title: "Banked reset",
  status: "available",
  expiresAt: future,
};
const consumed = {
  id: "credit-consumed",
  title: "Used reset",
  status: "consumed",
  expiresAt: future,
};

const normalized = normalizeCodexResetCredits({
  available_count: 1,
  credits: [
    { id: consumed.id, title: consumed.title, status: consumed.status, expires_at: future },
    { id: available.id, title: available.title, status: available.status, expires_at: future },
    { id: "credit-expired", status: "available", expires_at: past },
  ],
});
assert.equal(normalized.availableCount, 1);
assert.equal(normalized.credits[0].id, available.id, "available reset options sort before consumed and expired credits");
assert.equal(isCodexResetCreditAvailable(normalized.credits[0]), true);
assert.equal(isCodexResetCreditAvailable(normalized.credits.find((credit) => credit.id === "credit-expired")), false);
assert.deepEqual(normalizeCodexResetRedemption({ windows_reset: 2, code: "ok" }), {
  code: "ok",
  windowsReset: 2,
  redeemedAt: undefined,
  credit: undefined,
});
assert.equal(getSlashCommand("resets")?.name, "codexresets");
assert.equal(getSlashCommand("resetlist")?.name, "codexresetlist");

const confirmationDialog = createCodexResetConfirmationDialog(available, "Irreversible");
const confirmationHost = createDialogHost();
const previousInput = createPreviousInput();
confirmationHost.setInputComponent(previousInput);
const mountedConfirmation = runZyraInputDialog(confirmationHost, confirmationDialog);
assert.equal(confirmationHost.inputComponent, confirmationDialog.component, "the reset dialog replaces Zyra's editor while active");
const confirmationLines = stripAnsi(confirmationHost.renderFixedLines(100).join("\n"));
assert.match(confirmationLines, /Redeem this Codex reset\?/);
assert.match(confirmationLines, /Keep reset/);
assert.match(confirmationLines, /↑↓ navigate • enter choose • esc cancel/);
await dispatchTerminalKeypress(confirmationHost, previousInput, "\r", { name: "return", sequence: "\r" });
assert.equal(await mountedConfirmation, false, "the terminal input loop routes Enter to the mounted dialog and defaults to keeping the reset");
assert.equal(confirmationHost.inputComponent, previousInput, "the editor is restored when the dialog closes");
assert.equal(previousInput.inputLocked, false);

const selectionDialog = createCodexResetSelectionDialog([available, consumed]);
selectionDialog.component.handleInput("\x1b[B");
selectionDialog.component.handleInput("\r");
assert.equal((await selectionDialog.result)?.id, consumed.id, "reset picker supports Pi-style keyboard selection");
const selectionLines = stripAnsi(selectionDialog.component.render(100).join("\n"));
assert.match(selectionLines, /Select a banked Codex reset/);
assert.match(selectionLines, /Selecting does not redeem it\. Confirmation comes next\./);
assert.match(selectionLines, /1\. Banked reset/);
assert.match(selectionLines, /2\. Used reset/);

let redeemCalls = 0;
const cancelledUi = createFlowUi({ confirmation: false });
await runCodexResets(cancelledUi, {
  fetchResetCredits: async () => ({ availableCount: 1, credits: [available] }),
  fetchUsage: async () => usageSnapshot(),
  redeemReset: async () => { redeemCalls += 1; return { windowsReset: 2 }; },
});
assert.equal(redeemCalls, 0, "cancelling never consumes a reset credit")
assert.match(cancelledUi.messages.join("\n"), /No credit was used/);

let resetRead = 0;
const confirmedUi = createFlowUi({ confirmation: true });
await runCodexResets(confirmedUi, {
  fetchResetCredits: async () => {
    resetRead += 1;
    return { availableCount: resetRead < 3 ? 1 : 0, credits: resetRead < 3 ? [available] : [consumed] };
  },
  fetchUsage: async () => usageSnapshot(),
  redeemReset: async (creditId) => {
    redeemCalls += 1;
    assert.equal(creditId, available.id);
    return { windowsReset: 2 };
  },
});
assert.equal(redeemCalls, 1, "a confirmed, freshly available credit is consumed exactly once")
assert.match(confirmedUi.blocks.flat().join("\n"), /0 banked resets remaining/);

let unavailableRedeems = 0;
let unavailableRead = 0;
const staleUi = createFlowUi({ confirmation: true });
await runCodexResets(staleUi, {
  fetchResetCredits: async () => {
    unavailableRead += 1;
    return unavailableRead === 1
      ? { availableCount: 1, credits: [available] }
      : { availableCount: 0, credits: [consumed] };
  },
  fetchUsage: async () => usageSnapshot(),
  redeemReset: async () => { unavailableRedeems += 1; return {}; },
});
assert.equal(unavailableRedeems, 0, "a credit that becomes unavailable at the confirmation boundary is not consumed")
assert.match(staleUi.messages.join("\n"), /no longer available/);

console.log("Zyra Codex reset-credit flow: ok");

function createDialogHost() {
  return new ZyraComponentHost({
    output: {
      columns: 100,
      rows: 30,
      write() { return true; },
    },
  });
}

function createPreviousInput() {
  return {
    inputLocked: false,
    setHost(host) { this.host = host; },
    setInputLocked(value) { this.inputLocked = Boolean(value); },
    render() { return ["editor"]; },
  };
}

function usageSnapshot() {
  return {
    primary: { usedPercent: 80, windowSeconds: 18_000 },
    secondary: { usedPercent: 40, windowSeconds: 604_800 },
  };
}

function createFlowUi({ confirmation }) {
  return {
    messages: [],
    blocks: [],
    info(message) { this.messages.push(String(message)); },
    block(lines) { this.blocks.push(lines); },
    async selectCodexResetCredit(credits) { return credits[0]; },
    async confirmCodexResetRedemption() { return confirmation; },
  };
}
