export const STATUS_LINE_MODES = ["default", "minimal", "full", "off"];
export const NOTIFICATION_MODES = ["unfocused", "always", "off"];
export const INTERRUPT_MODES = ["steer", "queue"];

const slashCommands = [
  {
    name: "commands",
    aliases: ["help"],
    description: "show controls",
    submitOnEnter: true,
  },
  {
    name: "compact",
    description: "compact active context",
    panelLabel: "/compact [notes]",
    submitOnEnter: true,
    terminalState: "compacting",
  },
  {
    name: "consolidate",
    description: "consolidate Zyra memory",
    submitOnEnter: true,
    terminalState: "compacting",
  },
  {
    name: "statusline",
    aliases: ["status-line"],
    description: "edit the bottom status line",
    panelLabel: "/statusline [mode]",
    inlineArgs: STATUS_LINE_MODES,
  },
  {
    name: "notifications",
    aliases: ["notify"],
    description: "set terminal bell behavior",
    panelLabel: "/notifications [mode]",
    inlineArgs: NOTIFICATION_MODES,
  },
  {
    name: "interrupt",
    aliases: ["interupt", "interruption", "midrun", "mid-run"],
    description: "set mid-run Enter behavior",
    panelLabel: "/interrupt [steer|queue]",
    inlineArgs: INTERRUPT_MODES,
  },
  {
    name: "start",
    description: "ask for the repo starting point",
    submitOnEnter: true,
    availableDuringTask: false,
    terminalState: "working",
  },
  {
    name: "new",
    description: "start a fresh chat",
    submitOnEnter: true,
    availableDuringTask: false,
  },
  {
    name: "session",
    description: "project, model, context, usage",
    submitOnEnter: true,
  },
  {
    name: "chat",
    description: "current chat file and totals",
    submitOnEnter: true,
  },
  {
    name: "profile",
    description: "show or switch profile overlay",
    panelLabel: "/profile [name]",
    inlineArgs: ["auto", "default", "learner", "builder"],
  },
  {
    name: "thinking",
    aliases: ["effort"],
    description: "cycle or set thinking effort",
    panelLabel: "/thinking [level]",
  },
  {
    name: "themes",
    aliases: ["theme"],
    description: "pick a theme",
    panelLabel: "/themes [name]",
  },
  {
    name: "models",
    description: "open model picker",
    panelLabel: "/models <provider/model>",
  },
  {
    name: "memory",
    description: "toggle memory logging for this chat",
    submitOnEnter: true,
  },
  {
    name: "web",
    description: "choose web tools",
    inlineArgs: ["all", "none", "websearch", "webfetch"],
    submitOnEnter: true,
  },
  {
    name: "websearch",
    aliases: ["web-search"],
    description: "toggle web search",
    panelLabel: "/websearch [on|off]",
    inlineArgs: ["on", "off"],
    submitOnEnter: true,
  },
  {
    name: "webfetch",
    aliases: ["web-fetch"],
    description: "toggle page fetching",
    panelLabel: "/webfetch [on|off]",
    inlineArgs: ["on", "off"],
    submitOnEnter: true,
  },
  {
    name: "auth",
    aliases: ["account"],
    description: "account, plan, and Codex limits",
    panelLabel: "/auth, /account",
    submitOnEnter: true,
  },
  {
    name: "codexusage",
    aliases: ["usage"],
    description: "show Codex quota usage",
    submitOnEnter: true,
  },
  {
    name: "login",
    description: "login with ChatGPT/Codex",
    submitOnEnter: true,
  },
  {
    name: "logout",
    description: "clear ChatGPT/Codex login",
    submitOnEnter: true,
  },
  {
    name: "reload",
    aliases: ["realod"],
    description: "reload Zyra from disk and resume",
    submitOnEnter: true,
  },
  {
    name: "exit",
    aliases: ["quit"],
    description: "leave",
    panelLabel: "/exit, /quit",
    submitOnEnter: true,
  },
];

const commandLookup = new Map();

for (const command of slashCommands) {
  const normalized = normalizeSlashCommand(command.name);
  commandLookup.set(normalized, command);
  for (const alias of command.aliases ?? []) {
    commandLookup.set(normalizeSlashCommand(alias), command);
  }
}

export function listSlashCommands(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  return slashCommands.filter((command) => includeHidden || !command.hidden);
}

export function listSlashCommandSuggestions() {
  return listSlashCommands()
    .filter((command) => command.suggest !== false)
    .map((command) => ({
      value: `/${command.name}`,
      label: `/${command.name}`,
      description: command.description,
      kind: "command",
      submitOnEnter: command.submitOnEnter === true,
    }));
}

export function getSlashCommand(command) {
  return commandLookup.get(normalizeSlashCommand(command));
}

export function parseSlashInput(input) {
  const text = String(input ?? "").trim();
  const [rawCommand, ...rest] = text.split(/\s+/);
  const commandName = normalizeSlashCommand(rawCommand);
  return {
    text,
    rawCommand,
    commandName,
    command: getSlashCommand(commandName),
    arg: rest.join(" "),
  };
}

export function normalizeSlashCommand(command) {
  return String(command ?? "").trim().replace(/^\/+/, "").toLowerCase();
}
