const COMMAND_TO_WORKSPACE = Object.freeze({
  browser: "browser",
  "details-ui": "details",
  "explore-files": "explorer",
  resources: "resources",
  "subagents-ui": "agents",
  "diff-ui": "diff",
  "terminal-ui": "terminal",
});

export const DESKTOP_WORKSPACE_COMMANDS = Object.freeze(Object.keys(COMMAND_TO_WORKSPACE));
export const DESKTOP_WORKSPACE_KINDS = Object.freeze([...new Set(Object.values(COMMAND_TO_WORKSPACE))]);

export function workspaceForDesktopCommand(commandName) {
  return COMMAND_TO_WORKSPACE[String(commandName || "").toLowerCase()] || null;
}

export function parseDesktopWorkspaceCommand(commandName, rawArgument = "") {
  const workspace = workspaceForDesktopCommand(commandName);
  if (!workspace) throw new Error(`Unknown graphical command: /${commandName}`);
  const tokens = tokenize(String(rawArgument || ""));
  const positional = [];
  let chat = null;
  let background = false;
  let focus = false;
  let newWindow = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--background") {
      if (workspace !== "browser") throw new Error("--background is available only with /browser.");
      background = true;
      continue;
    }
    if (token === "--focus") {
      focus = true;
      continue;
    }
    if (token === "--new-window") {
      newWindow = true;
      continue;
    }
    if (token === "--chat") {
      const value = tokens[++index];
      if (!value || value.startsWith("--")) throw new Error("--chat requires a chat title or ID.");
      chat = value;
      continue;
    }
    if (token.startsWith("--")) throw new Error(`Unknown option: ${token}`);
    positional.push(token);
  }

  if (background && chat) throw new Error("/browser --background uses the current chat.");
  if (background && focus) throw new Error("A background Browser tab cannot also request focus.");
  if (background && newWindow) throw new Error("A background Browser tab does not create a visible window.");

  if (workspace === "browser") {
    const action = positional[0]?.toLowerCase();
    if ((action === "list" || action === "show") && positional.length === 1) {
      return { operation: action, workspace, chat, focus: action === "show" ? focus : false };
    }
    if (positional.length > 1) throw new Error("Use /browser [url] [--background] [--chat <chat>].");
    return {
      operation: "open",
      workspace,
      chat,
      url: positional[0] || "",
      background,
      focus,
      newWindow,
    };
  }

  if (positional.length > 1) throw new Error(`Use /${commandName} [path] [--chat <chat>].`);
  return {
    operation: "open",
    workspace,
    chat,
    path: positional[0] || "",
    background: false,
    focus,
    newWindow,
  };
}

export function formatDesktopWorkspaceResult(command, result = {}) {
  if (command.operation === "list") {
    const tabs = Array.isArray(result.tabs) ? result.tabs : [];
    if (tabs.length === 0) return "No Zyra Browser tabs are open.";
    return tabs.map((tab, index) => `${index + 1}. ${tab.title || "New tab"}${tab.chatTitle ? ` · ${tab.chatTitle}` : ""}${tab.background ? " · background" : ""}`).join("\n");
  }
  const chatTitle = result.chatTitle || "this chat";
  const label = result.label || labelForWorkspace(command.workspace);
  if (command.operation === "show") return `Opened ${label} for ${chatTitle}.`;
  if (command.background) return `${label} opened in the background for ${chatTitle}.`;
  return `Opened ${label} for ${chatTitle}.`;
}

export function labelForWorkspace(workspace) {
  return ({
    browser: "Browser",
    details: "Details",
    explorer: "Files",
    resources: "Resources",
    agents: "Agents",
    diff: "Diff",
    terminal: "Terminal",
  })[workspace] || "Zyra";
}

function tokenize(value) {
  const text = value.trim();
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (character === "\\" && quote === '"' && (text[index + 1] === '"' || text[index + 1] === "\\")) {
        current += text[++index];
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (quote) throw new Error("The command contains an unfinished quote.");
  if (current) tokens.push(current);
  return tokens;
}
