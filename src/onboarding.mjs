import readline from "node:readline";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configureZyraOpenAIApiKey, getZyraAuthOverview, loginZyraAuth, verifyZyraOpenAIApiAuth } from "./zyra-sdk.mjs";
import {
  chooseVerifiedApiModel,
  ZYRA_SUBSCRIPTION_DEFAULT_MODEL,
} from "./auth-methods.mjs";
import { promptSecret } from "./secret-input.mjs";
import { buildTerminalTheme, listTerminalThemes } from "./terminal-theme.mjs";
import { zyraLogoRows } from "./zyra-logo.mjs";

const ONBOARDING_VERSION = 1;
const ZYRA_VERSION = process.env.ZYRA_VERSION
  || JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const ONBOARDING_FILE = "onboarding.json";
const FIRST_PROMPT = "I just installed Zyra. Can you show me around slowly?";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";
const clearScreen = "\x1b[2J\x1b[3J\x1b[H";
const fastOnboarding = process.env.ZYRA_ONBOARDING_FAST === "1" || process.env.CI === "true";
const BACK = "__zyra_onboarding_back__";

const ZYRA_LOGO = zyraLogoRows;

const FEELINGS = [
  "this one feels calm enough to think in.",
  "this one has a little spark ✨",
  "I think you might like this one.",
  "this feels like a good room to learn in.",
  "a sharper one, if you want that edge.",
  "soft, but still clear.",
  "this one feels focused.",
  "a tiny bit dramatic, in a useful way.",
  "this one has the warm desk-lamp feel.",
  "clean, steady, not too loud.",
];

export function shouldRunOnboarding(options = {}) {
  if (options.force) return true;
  if (options.skip) return false;
  if (process.env.ZYRA_NO_ONBOARDING === "1") return false;
  if (process.env.CI === "true") return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const state = readOnboardingState(options.root);
  return state.version !== ONBOARDING_VERSION || !state.completedAt;
}

export function readOnboardingState(root) {
  const file = onboardingFile(root);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markOnboardingComplete(root, data = {}) {
  const file = onboardingFile(root);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    ...data,
  }, null, 2)}\n`, "utf8");
}

export async function runOnboarding(options = {}) {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  if (!input.isTTY || !output.isTTY) return { completed: false };

  const state = {
    theme: buildTerminalTheme(options.theme ?? options.currentTheme),
    model: options.model ?? "openai-codex/gpt-5.6-sol",
    profile: options.profile ?? "default",
    effort: options.effort ?? "medium",
  };

  output.write(hideCursor);
  try {
    await animateLogo(output, state);
    await typeScene(output, state, [
      "hey, welcome to Zyra ✨",
      "a local coding workshop for reading, changing, and understanding real projects.",
      "we will keep it warm, practical, and checked against the actual files.",
    ], { prompt: "press Enter so we can get you started" });
    await waitForEnter(input);

    await typeScene(output, state, [
      "First, choose how Zyra connects to OpenAI.",
      "You can use your ChatGPT subscription or a separately billed OpenAI API key.",
      "On the next step, we will help you connect either method.",
    ], { prompt: "press Enter when you are ready", statusLines: statusLines(state) });
    await waitForEnter(input);

    let auth = { status: "skipped" };
    let selectedTheme = options.currentTheme ?? state.theme.name;
    let webTools = {
      webSearch: options.webSearch ?? true,
      webFetch: options.webFetch ?? true,
    };
    let step = "auth";

    while (step !== "done") {
      if (step === "auth") {
        const result = await onboardAuth({ input, output, state, allowBack: true });
        if (result === BACK) {
          await typeScene(output, state, [
            "First, choose how Zyra connects to OpenAI.",
            "You can use your ChatGPT subscription or a separately billed OpenAI API key.",
            "On the next step, we will help you connect either method.",
          ], { prompt: keyFooter([["Enter", "continue"]]), statusLines: statusLines(state) });
          await waitForEnter(input);
          continue;
        }
        auth = result;
        step = "theme";
        continue;
      }

      if (step === "theme") {
        const result = await selectTheme({
          input,
          output,
          state,
          root: options.assetRoot || options.root,
          project: options.project,
          currentTheme: selectedTheme,
          allowBack: true,
        });
        if (result === BACK) {
          state.theme = buildTerminalTheme(selectedTheme);
          step = "auth";
          continue;
        }
        selectedTheme = result;
        state.theme = buildTerminalTheme(selectedTheme);
        step = "web";
        continue;
      }

      if (step === "web") {
        const result = await selectWebToolsImmersive({ input, output, state, current: webTools, allowBack: true });
        if (result === BACK) {
          step = "theme";
          continue;
        }
        webTools = result;
        step = "desktop";
        continue;
      }

      if (step === "desktop") {
        if (process.env.ZYRA_DISTRIBUTION === "desktop-bundle" || options.offerDesktop === false) {
          step = "finish";
          continue;
        }
        const result = await offerDesktopApp({ input, output, state, options, allowBack: true });
        if (result === BACK) {
          step = "web";
          continue;
        }
        state.desktopInstall = result;
        step = "finish";
        continue;
      }

      if (step === "finish") {
        const result = await renderPersonalFinish({ input, output, state, selectedTheme, webTools, allowBack: true });
        if (result === BACK) {
          step = process.env.ZYRA_DISTRIBUTION === "desktop-bundle" || options.offerDesktop === false ? "web" : "desktop";
          continue;
        }
        step = "done";
      }
    }

    markOnboardingComplete(options.root, {
      auth: auth.status,
      authMethod: auth.method,
      terminalTheme: selectedTheme,
      webSearch: webTools.webSearch,
      webFetch: webTools.webFetch,
      desktopInstall: state.desktopInstall || "not-offered",
    });

    output.write(clearScreen);
    return {
      completed: true,
      authMethod: auth.method,
      model: auth.model,
      terminalTheme: selectedTheme,
      webSearch: webTools.webSearch,
      webFetch: webTools.webFetch,
      starterPrompt: FIRST_PROMPT,
    };
  } finally {
    output.write(showCursor);
  }
}

async function offerDesktopApp({ input, output, state, options, allowBack = false }) {
  const choice = await selectScene({
    input,
    output,
    state,
    title: "Add Zyra Desktop?",
    subtitle: "Desktop adds Browser and graphical Details, Files, Resources, Agents, Diff, and Terminal windows.",
    items: [
      { value: "install", label: "Install Zyra Desktop", description: "download the matching verified Desktop app" },
      { value: "skip", label: "Not now", description: "the TUI keeps working on its own" },
    ],
    prompt: keyFooter([["Up/Down", "move"], ["Enter", "choose"], ...(allowBack ? [["B", "previous"]] : [])]),
    allowBack,
  });
  if (choice === BACK) return BACK;
  if (choice !== "install") return "not-now";
  try {
    renderFrame(output, state, {
      statusLines: statusLines(state),
      bodyLines: ["Downloading the matching Zyra Desktop release…", "The installer is verified before it opens."],
      prompt: "please wait",
    });
    const install = options.installDesktop || (async () => {
      const { installMatchingDesktop } = await import("./desktop-app.mjs");
      return installMatchingDesktop({ version: options.version || ZYRA_VERSION });
    });
    await install();
    await typeScene(output, state, ["Zyra Desktop installer opened.", "Finish its setup whenever you are ready."], {
      prompt: keyFooter([["Enter", "continue"]]),
      statusLines: statusLines(state),
    });
    await waitForEnter(input);
    return "installer-opened";
  } catch (error) {
    await typeScene(output, state, ["Desktop installation did not start.", error instanceof Error ? error.message : String(error), "You can continue with the TUI and install Desktop later."], {
      prompt: keyFooter([["Enter", "continue"]]),
      statusLines: statusLines(state),
    });
    await waitForEnter(input);
    return "failed";
  }
}

async function onboardAuth({ input, output, state, allowBack = false }) {
  const overview = await getZyraAuthOverview().catch(() => ({}));
  const choice = await selectScene({
    input,
    output,
    state,
    title: "Connect OpenAI",
    subtitle: "Subscription uses your ChatGPT plan. API usage is billed separately by OpenAI.",
    items: [
      {
        value: "subscription",
        label: "ChatGPT subscription",
        description: overview.subscription?.configured ? "connected" : "browser sign-in",
      },
      {
        value: "api",
        label: "OpenAI API",
        description: overview.api?.configured ? "connected" : "verified API key",
      },
      { value: "skip", label: "Skip for now", description: "run zyra login later" },
    ],
    prompt: keyFooter([["Up/Down", "move"], ["Enter", "choose"], ["Esc", "skip"], ...(allowBack ? [["B", "previous"]] : [])]),
    allowBack,
  });

  if (choice === BACK) return BACK;
  if (!["subscription", "api"].includes(choice)) return { status: "skipped" };

  try {
    let model;
    if (choice === "subscription") {
      if (!overview.subscription?.configured) {
        renderFrame(output, state, {
          statusLines: statusLines(state),
          bodyLines: ["Opening the browser...", "Finish the ChatGPT sign-in, then return here."],
          prompt: "waiting for browser sign-in",
        });
        await loginZyraAuth("openai-codex", {
          onMessage: (message) => renderFrame(output, state, {
            statusLines: statusLines(state),
            bodyLines: ["ChatGPT sign-in is running", stripAnsi(String(message ?? ""))],
            prompt: "finish the browser step, then return here",
          }),
        });
      }
      model = ZYRA_SUBSCRIPTION_DEFAULT_MODEL;
    } else if (overview.api?.configured) {
      const verification = await verifyZyraOpenAIApiAuth();
      model = chooseVerifiedApiModel(verification);
      if (!model) throw new Error("The API key is valid, but no supported GPT-5.6 API model is available to this account.");
    } else {
      renderFrame(output, state, {
        statusLines: statusLines(state),
        bodyLines: ["Enter your OpenAI API key below.", "The key is masked and verified before it is saved."],
        prompt: "secure API key input",
      });
      const key = await promptSecret("OpenAI API key", { input, output });
      const verification = await configureZyraOpenAIApiKey(key);
      model = chooseVerifiedApiModel(verification);
      if (!model) throw new Error("The API key is valid, but no supported GPT-5.6 API model is available to this account.");
    }

    state.model = model;
    await typeScene(output, state, [
      "Connection complete.",
      `${choice === "api" ? "OpenAI API" : "ChatGPT subscription"} will use ${model}.`,
    ], { prompt: keyFooter([["Enter", "continue"], ...(allowBack ? [["B", "previous"]] : [])]), statusLines: statusLines(state) });
    if (await waitForEnter(input, { allowBack }) === BACK) return BACK;
    return { status: "connected", method: choice, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await typeScene(output, state, [
      "The connection did not finish.",
      message,
      "You can run `zyra login subscription` or `zyra login api` later.",
    ], { prompt: keyFooter([["Enter", "continue"], ...(allowBack ? [["B", "previous"]] : [])]), statusLines: statusLines(state) });
    if (await waitForEnter(input, { allowBack }) === BACK) return BACK;
    return { status: "failed", method: choice, error: message };
  }
}

async function selectTheme(options = {}) {
  const themes = listTerminalThemes({ root: options.root, project: options.project });
  const current = options.currentTheme || "rose-pine";
  const selected = await selectScene({
    input: options.input,
    output: options.output,
    state: options.state,
    title: "Now let us customize how Zyra looks 🎨",
    subtitle: "Move through the list. The whole onboarding changes color as you move.",
    items: themes.map((theme) => ({
      value: theme.name,
      label: theme.displayName ?? theme.name,
      description: theme.description ?? theme.source ?? "",
      selected: theme.name === current,
      themeName: theme.name,
    })),
    prompt: keyFooter([["↑↓", "move"], ["Enter", "choose"], ["Esc", "keep current"], ...(options.allowBack ? [["B", "previous"]] : [])]),
    onPreview: (item) => {
      options.state.theme = buildTerminalTheme(item.themeName ?? item.value);
    },
    activeHint: (_item, selectedIndex) => FEELINGS[selectedIndex % FEELINGS.length],
    showPalette: true,
    allowBack: options.allowBack,
  });
  if (selected === BACK) return BACK;
  const chosen = selected || current;
  options.state.theme = buildTerminalTheme(chosen);
  return chosen;
}

async function selectWebToolsImmersive({ input, output, state, current, allowBack = false }) {
  const selected = await selectScene({
    input,
    output,
    state,
    title: "Nice. Zyra can also use the web 🌐",
    subtitle: "Turn on the parts you want. Search looks things up; fetch reads a page URL.",
    items: [
      { value: "all", label: "All web tools", description: "search and fetch are both on", selected: current.webSearch && current.webFetch },
      { value: "none", label: "No web tools", description: "Zyra stays local unless you change it", selected: !current.webSearch && !current.webFetch },
      { value: "websearch", label: "Web search", description: "current search behavior only", selected: current.webSearch && !current.webFetch },
      { value: "webfetch", label: "Web fetch", description: "fetch pages from URLs only", selected: current.webFetch && !current.webSearch },
    ],
    prompt: keyFooter([["↑↓", "move"], ["Enter", "save"], ["Esc", "keep current"], ...(allowBack ? [["B", "previous"]] : [])]),
    afterMenu: (item) => webFeeling(item.value),
    allowBack,
  });

  if (selected === BACK) return BACK;
  if (!selected) return current;
  if (selected === "all") return { webSearch: true, webFetch: true };
  if (selected === "none") return { webSearch: false, webFetch: false };
  if (selected === "websearch") return { webSearch: true, webFetch: false };
  if (selected === "webfetch") return { webSearch: false, webFetch: true };
  return current;
}

async function renderPersonalFinish({ input, output, state, selectedTheme, webTools, allowBack = false }) {
  const web = webTools.webSearch && webTools.webFetch
    ? "web search and page fetch are on"
    : webTools.webSearch
      ? "web search is on"
      : webTools.webFetch
        ? "page fetch is on"
        : "web tools are off";

  await typeScene(output, state, [
    "Zyra is ready.",
    "You can ask the rough version first. Zyra will help you inspect, name, fix, and verify one useful thing at a time.",
    "",
    `Theme: ${selectedTheme}`,
    `Web: ${web}`,
    "",
    "First thing you can ask Zyra:",
    FIRST_PROMPT,
  ], { prompt: keyFooter([["Enter", "open Zyra"], ...(allowBack ? [["B", "previous"]] : [])]), statusLines: statusLines(state) });
  return waitForEnter(input, { allowBack });
}

async function selectScene(options = {}) {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  const state = options.state ?? { theme: buildTerminalTheme() };
  const items = options.items ?? [];
  if (!items.length) return undefined;

  readline.emitKeypressEvents(input);
  const wasRaw = Boolean(input.isRaw);
  if (!wasRaw) input.setRawMode(true);
  input.resume();

  let selected = Math.max(0, items.findIndex((item) => item.selected));
  if (selected < 0) selected = 0;
  let done = false;
  let resolveDone = () => {};
  const completion = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function render() {
    const item = items[selected];
    if (typeof options.onPreview === "function") options.onPreview(item, selected);
    renderFrame(output, state, {
      statusLines: statusLines(state),
      bodyLines: [
        options.title ?? "Choose",
        options.subtitle ?? "",
        "",
        ...menuLines(items, selected, {
          width: output.columns ?? 90,
          theme: state.theme,
          showPalette: options.showPalette,
          activeHint: typeof options.activeHint === "function" ? options.activeHint(item, selected) : undefined,
        }),
        "",
        typeof options.afterMenu === "function"
          ? options.afterMenu(item, selected)
          : typeof options.activeHint === "function"
            ? options.activeHint(item, selected)
            : "",
      ],
      prompt: options.prompt ?? keyFooter([["↑↓", "move"], ["Enter", "choose"], ["Esc", "cancel"]]),
    });
  }

  function finish(value) {
    if (done) return;
    done = true;
    input.off("keypress", onKeypress);
    if (!wasRaw) {
      input.setRawMode(false);
      input.pause();
    }
    resolveDone(value);
  }

  function onKeypress(str, key) {
    if (key?.ctrl && key.name === "c") process.exit(130);
    if (options.allowBack && (key?.name === "backspace" || String(str ?? "").toLowerCase() === "b")) return finish(BACK);
    if (key?.name === "escape") return finish(undefined);
    if (key?.name === "return") return finish(items[selected]?.value);
    if (key?.name === "down") selected = (selected + 1) % items.length;
    else if (key?.name === "up") selected = (selected - 1 + items.length) % items.length;
    else if (/^[1-9]$/.test(String(str ?? "")) && Number(str) <= items.length) selected = Number(str) - 1;
    else return;
    render();
  }

  input.on("keypress", onKeypress);
  render();
  return completion;
}

function menuLines(items, selected, options = {}) {
  const theme = buildTerminalTheme(options.theme);
  const width = Math.max(62, Number(options.width) || 90);
  const max = Math.min(9, items.length);
  const half = Math.floor(max / 2);
  let start = Math.max(0, selected - half);
  if (start + max > items.length) start = Math.max(0, items.length - max);
  const visible = items.slice(start, start + max);
  const tableTargetWidth = Math.min(96, Math.max(72, Math.floor(width * 0.72)));
  const canShowPalette = options.showPalette && width >= tableTargetWidth + 34;
  const paletteWidth = canShowPalette ? 22 : 0;
  const gapWidth = paletteWidth ? 4 : 0;
  const tableWidth = Math.max(72, Math.min(96, width - 8 - paletteWidth - gapWidth));
  const numberWidth = 2;
  const prefixWidth = 6;
  const columnGap = 3;
  const nameWidth = Math.min(22, Math.max(20, ...visible.map((item) => visibleWidth(item.label ?? ""))));
  const descriptionWidth = Math.max(18, tableWidth - prefixWidth - nameWidth - columnGap);
  const tableRows = [
    `${theme.dimMuted}${padEnd("theme", prefixWidth + nameWidth + columnGap)}${padEnd("description", descriptionWidth)}${reset}`,
    `${theme.dimMuted}${"─".repeat(tableWidth)}${reset}`,
  ];
  tableRows.push(...visible.map((item, offset) => {
    const index = start + offset;
    const active = index === selected;
    const marker = active ? "›" : " ";
    const number = String(index + 1).padStart(numberWidth, "0");
    const name = padEnd(plainLimit(item.label ?? "", nameWidth), nameWidth);
    const description = padEnd(plainLimit(item.description ?? "", descriptionWidth), descriptionWidth);
    const prefix = `${marker} ${number}  `;
    const nameStyle = active ? `${bold}${theme.primary}` : theme.primary;
    return `${theme.muted}${prefix}${reset}${nameStyle}${name}${reset}${" ".repeat(columnGap)}${theme.dimMuted}${description}${reset}`;
  }));

  if (!paletteWidth) return tableRows;
  return joinColumns(tableRows, paletteRows(theme, paletteWidth), gapWidth);
}

function paletteRows(theme, width) {
  const rows = [
    `${theme.dimMuted}${padEnd("palette", width)}${reset}`,
    `${theme.dimMuted}${"─".repeat(width)}${reset}`,
    paletteSwatch("primary", theme.primary, theme, width),
    paletteSwatch("accent", theme.accent, theme, width),
    paletteSwatch("info", theme.info, theme, width),
    paletteSwatch("success", theme.success, theme, width),
    paletteSwatch("warning", theme.warning, theme, width),
    paletteSwatch("error", theme.error, theme, width),
  ];
  return rows.map((row) => padAnsi(row, width));
}

function paletteSwatch(label, color, theme, width) {
  return `${theme.dimMuted}${padEnd(label, Math.max(9, width - 5))}${reset}${color}███${reset}`;
}

function joinColumns(leftRows, rightRows, gap) {
  const leftWidth = Math.max(...leftRows.map(visibleWidth), 0);
  const rightWidth = Math.max(...rightRows.map(visibleWidth), 0);
  const height = Math.max(leftRows.length, rightRows.length);
  const rows = [];
  for (let index = 0; index < height; index += 1) {
    const left = padAnsi(leftRows[index] ?? "", leftWidth);
    const right = padAnsi(rightRows[index] ?? "", rightWidth);
    rows.push(`${left}${" ".repeat(gap)}${right}`);
  }
  return rows;
}

async function animateLogo(output, state) {
  const total = ZYRA_LOGO.join("\n").length;
  const step = fastOnboarding ? total : 5;
  for (let progress = 0; progress <= total; progress += step) {
    renderFrame(output, state, { logoProgress: progress, bodyLines: [], prompt: "" });
    await sleep(12);
  }
  renderFrame(output, state, { logoProgress: total, bodyLines: [], prompt: "" });
}

async function typeScene(output, state, lines = [], options = {}) {
  const typed = lines.map(() => "");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = String(lines[lineIndex] ?? "");
    if (!line) {
      typed[lineIndex] = "";
      renderFrame(output, state, { ...options, bodyLines: typed });
      await sleep(45);
      continue;
    }
    for (let charIndex = 1; charIndex <= line.length; charIndex += 1) {
      typed[lineIndex] = line.slice(0, charIndex);
      renderFrame(output, state, { ...options, bodyLines: typed });
      await sleep(9);
    }
    await sleep(45);
  }
  renderFrame(output, state, { ...options, bodyLines: lines });
}

function renderFrame(output, state, parts = {}) {
  const theme = buildTerminalTheme(state.theme);
  const width = Math.max(62, output.columns ?? 90);
  const rows = Math.max(24, output.rows ?? 30);
  const bodyLines = expandLines(parts.bodyLines ?? [], Math.min(76, width - 8));
  const status = parts.statusLines ?? [];
  const prompt = parts.prompt ?? "";
  const bodyHeight = bodyLines.length + status.length + 3;
  const topPad = Math.max(1, Math.floor((rows - ZYRA_LOGO.length - bodyHeight) / 4));
  const logoWidth = Math.max(...ZYRA_LOGO.map((line) => visibleWidth(line)), 0);
  const logoLeft = Math.max(0, Math.floor((width - logoWidth) / 2));

  const lines = [
    clearScreen,
    "\n".repeat(topPad),
    ...partialLogo(parts.logoProgress).map((line) => `${" ".repeat(logoLeft)}${bold}${theme.primary}${line}${reset}`),
  ];

  if (status.length) {
    lines.push("");
    for (const line of status) lines.push(centerAnsi(`${theme.dimMuted}${line}${reset}`, width));
  }

  lines.push("");
  let highlighted = false;
  for (const line of bodyLines) {
    if (!String(line ?? "").trim()) {
      lines.push("");
      continue;
    }
    const style = !highlighted ? `${bold}${theme.primary}` : theme.muted;
    highlighted = true;
    const value = line.includes("\x1b[") ? line : `${style}${line}${reset}`;
    lines.push(centerAnsi(value, width));
  }

  if (prompt) {
    lines.push("");
    const value = String(prompt).includes("\x1b[") ? prompt : `${theme.warning}${prompt}${reset}`;
    lines.push(centerAnsi(value, width));
  }

  output.write(lines.join("\n"));
}

function partialLogo(progress) {
  if (progress === undefined) return ZYRA_LOGO;
  let remaining = Math.max(0, progress);
  return ZYRA_LOGO.map((line) => {
    if (remaining >= line.length) {
      remaining -= line.length + 1;
      return line;
    }
    const partial = line.slice(0, remaining);
    remaining = 0;
    return partial;
  });
}

function expandLines(lines, maxWidth) {
  const expanded = [];
  for (const line of lines) {
    const value = String(line ?? "");
    if (value.includes("\x1b[")) {
      expanded.push(value);
      continue;
    }
    expanded.push(...wrapPlain(value, maxWidth));
  }
  return expanded;
}

function wrapPlain(value, maxWidth) {
  if (!value) return [""];
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (visibleWidth(next) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [value];
}

async function waitForEnter(input, options = {}) {
  readline.emitKeypressEvents(input);
  const wasRaw = Boolean(input.isRaw);
  if (!wasRaw) input.setRawMode(true);
  input.resume();
  const result = await new Promise((resolve) => {
    const onKeypress = (str, key) => {
      if (key?.ctrl && key.name === "c") process.exit(130);
      if (options.allowBack && (key?.name === "backspace" || String(str ?? "").toLowerCase() === "b")) {
        input.off("keypress", onKeypress);
        resolve(BACK);
      }
      if (key?.name === "return") {
        input.off("keypress", onKeypress);
        resolve("next");
      }
    };
    input.on("keypress", onKeypress);
  });
  if (!wasRaw) {
    input.setRawMode(false);
    input.pause();
  }
  return result;
}

function statusLines(state) {
  return [`${state.model ?? "openai-codex"} · ${state.profile ?? "default"} · ${state.effort ?? "medium"}`];
}

function webFeeling(value) {
  if (value === "all") return "best when you want Zyra to understand the outside world too.";
  if (value === "none") return "good when you want everything quiet and local for now.";
  if (value === "websearch") return "good for current answers without reading full pages.";
  if (value === "webfetch") return "good when you already have the URL and want Zyra to read it.";
  return "";
}


function centerAnsi(value, width) {
  const length = visibleWidth(value);
  const left = Math.max(0, Math.floor((width - length) / 2));
  return `${" ".repeat(left)}${value}`;
}

function visibleWidth(value) {
  return stripAnsi(String(value ?? "")).length;
}

function stripAnsi(value) {
  return String(value ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

function plainLimit(value, max) {
  const text = stripAnsi(String(value ?? ""));
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}

function padEnd(value, width) {
  const text = String(value ?? "");
  return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

function padAnsi(value, width) {
  const text = String(value ?? "");
  return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

function keyFooter(keys) {
  return keys.map(([key, label]) => `[${key}] ${label}`).join("   ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, fastOnboarding ? 0 : ms));
}

function onboardingFile(root = process.cwd()) {
  return path.join(root, ".zyra", ONBOARDING_FILE);
}
