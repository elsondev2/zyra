import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import { formatCodexResetChoiceDescription } from "./codex-reset-format.mjs";
import { buildTerminalTheme } from "./terminal-theme.mjs";

const bold = "\x1b[1m";
const reset = "\x1b[0m";

export function createCodexResetSelectionDialog(credits = [], options = {}) {
  const items = credits.map((credit, index) => ({
    value: credit.id,
    label: `${index + 1}. ${credit.title}`,
    description: formatCodexResetChoiceDescription(credit),
  }));
  if (items.length === 0) return null;

  const dialog = createChoiceDialog({
    title: "Select a banked Codex reset",
    subtitle: "Selecting does not redeem it. Confirmation comes next.",
    items,
    help: "↑↓ navigate • enter review • esc cancel",
  }, options);
  return {
    component: dialog.component,
    result: dialog.result.then((selectedId) => credits.find((credit) => credit.id === selectedId) ?? null),
  };
}

export function createCodexResetConfirmationDialog(credit, warning, options = {}) {
  return createChoiceDialog({
    title: "Redeem this Codex reset?",
    subtitle: warning,
    subtitleTone: "warning",
    items: [
      { value: "keep", label: "Keep reset", description: "Cancel without spending a credit" },
      { value: "redeem", label: `Redeem ${credit.title}`, description: "Spend one banked credit now; this cannot be undone" },
    ],
    initialIndex: 0,
    help: "↑↓ navigate • enter choose • esc cancel",
  }, options, (value) => value === "redeem");
}

export function createChoiceDialog(config, options = {}, mapResult = (value) => value) {
  const theme = buildTerminalTheme(options.theme);
  let finish = () => {};
  let finished = false;
  const result = new Promise((resolve) => {
    finish = (value) => {
      if (finished) return;
      finished = true;
      resolve(value === null ? null : mapResult(value));
    };
  });
  const component = new ChoiceDialogComponent(config, theme, finish);
  return { component, result };
}

export class ChoiceDialogComponent {
  constructor(config, theme, done) {
    this.key = `dialog-${Date.now()}-${Math.random()}`;
    this.theme = theme;
    this.done = done;
    this.container = new Container();
    this.list = new SelectList(
      config.items,
      Math.min(config.items.length, 10),
      {
        selectedPrefix: (text) => `${theme.accent}${text}${reset}`,
        selectedText: (text) => `${theme.accent}${text}${reset}`,
        description: (text) => `${theme.menuDescriptionFg ?? theme.muted}${text}${reset}`,
        scrollInfo: (text) => `${theme.dimMuted}${text}${reset}`,
        noMatch: (text) => `${theme.warning}${text}${reset}`,
      },
    );
    this.list.setSelectedIndex(config.initialIndex ?? 0);
    this.list.onSelect = (item) => this.done(item.value);
    this.list.onCancel = () => this.done(null);

    const border = () => new DynamicBorder((text) => `${theme.accent}${text}${reset}`);
    const subtitleStyle = config.subtitleTone === "warning" ? theme.warning : theme.muted;
    this.container.addChild(border());
    this.container.addChild(new Text(`${theme.accent}${bold}${config.title}${reset}`, 1, 0));
    if (config.subtitle) this.container.addChild(new Text(`${subtitleStyle}${config.subtitle}${reset}`, 1, 0));
    this.container.addChild(this.list);
    this.container.addChild(new Text(`${theme.dimMuted}${config.help}${reset}`, 1, 0));
    this.container.addChild(border());
  }

  setHost(host) {
    this.host = host;
  }

  render(width) {
    return this.container.render(width);
  }

  invalidate() {
    this.container.invalidate();
  }

  handleInput(data) {
    this.list.handleInput(data);
    this.host?.invalidate({ fixedOnly: true, force: true });
  }

  handleKeypress(str, key) {
    this.handleInput(key?.sequence ?? str ?? "");
  }
}
