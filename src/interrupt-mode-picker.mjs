import readline from "node:readline";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { buildTerminalTheme } from "./terminal-theme.mjs";

const reset = "\x1b[0m";
const inverse = "\x1b[7m";
const bold = "\x1b[1m";
const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";

const MODES = [
  { id: "steer", label: "Steer", description: "Enter sends after the next tool-call boundary", value: "steer" },
  { id: "queue", label: "Queue", description: "Enter sends after the active turn finishes", value: "queue" },
];

export async function selectInterruptMode(current = "steer", options = {}) {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  if (!input.isTTY || !output.isTTY) return null;

  const theme = buildTerminalTheme(options.theme);
  readline.emitKeypressEvents(input);
  const wasRaw = Boolean(input.isRaw);
  if (!wasRaw) input.setRawMode(true);
  input.resume();

  let selected = Math.max(0, MODES.findIndex((item) => item.value === normalizeInterruptMode(current)));
  if (selected < 0) selected = 0;
  let renderedLines = 0;
  let done = false;
  let resolveDone = () => {};
  const completion = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function clear() {
    if (renderedLines > 0) {
      readline.moveCursor(output, 0, -renderedLines);
      readline.cursorTo(output, 0);
      readline.clearScreenDown(output);
      renderedLines = 0;
    }
  }

  function render() {
    const width = Math.max(62, (output.columns ?? 96) - 1);
    const cappedWidth = Math.min(width, 86);
    const lines = [
      `${bold}${theme.primary}Mid-run message behavior${reset} ${theme.muted}Enter saves - Esc cancels${reset}`,
      `${theme.muted}${"-".repeat(cappedWidth)}${reset}`,
    ];

    MODES.forEach((mode, index) => {
      const active = index === selected;
      const checked = active ? "x" : " ";
      const row = ` [${checked}] ${mode.label.padEnd(8)} ${mode.description}`;
      lines.push(active ? `${inverse}${row.padEnd(cappedWidth, " ")}${reset}` : ` ${theme.primary}[ ]${reset} ${mode.label.padEnd(8)} ${theme.muted}${mode.description}${reset}`);
    });

    lines.push(`${theme.muted}${"-".repeat(cappedWidth)}${reset}`);
    lines.push(`${theme.muted}Tip: queued text waits above input, then appears in chat only when delivered.${reset}`);

    clear();
    output.write(`${hideCursor}${lines.join("\n")}`);
    renderedLines = lines.length - 1;
  }

  function finish(value) {
    if (done) return;
    done = true;
    input.off("keypress", onKeypress);
    if (!wasRaw) {
      input.setRawMode(false);
      input.pause();
    }
    clear();
    output.write(showCursor);
    resolveDone(value);
  }

  function onKeypress(str, key) {
    let handled = true;
    if (key?.ctrl && key.name === "c") process.exit(130);
    if (key?.name === "escape") return finish(null);
    if (key?.name === "return") return finish(MODES[selected].value);
    if (key?.name === "space" || str === " ") return render();
    if (key?.name === "down") selected = (selected + 1) % MODES.length;
    else if (key?.name === "up") selected = (selected - 1 + MODES.length) % MODES.length;
    else if (str === "1") selected = 0;
    else if (str === "2") selected = 1;
    else handled = false;
    if (!handled) return;
    render();
  }

  input.on("keypress", onKeypress);
  render();
  return completion;
}

export function normalizeInterruptMode(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (["steer", "steering", "interrupt", "interrupting", "inline", "now"].includes(text)) return "steer";
  if (["queue", "queued", "followup", "follow-up", "follow_up", "later", "after"].includes(text)) return "queue";
  return undefined;
}
