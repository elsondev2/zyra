// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as TuiLayouts from "../../../../terminal/src/index.js";
import {
  CombinedAutocompleteProvider,
  Container,
  fuzzyFilter,
  getCapabilities,
  hyperlink,
  Markdown,
  matchesKey,
  ProcessTerminal,
  Spacer,
  setKeybindings,
  Text,
  TruncatedText,
  TuiAltScreen,
  TuiMainScreen,
  visibleWidth
} from "../../../../terminal/src/index.js";
import chalk from "chalk";
import { spawn } from "child_process";
import {
  APP_NAME,
  APP_TITLE,
  CONFIG_DIR_NAME,
  getAgentDir,
  getAuthPath,
  getDebugLogPath,
  getDocsPath,
  VERSION
} from "../../config.js";
import { parseSkillBlock } from "../../core/agent-session.js";
import { SessionImportFileNotFoundError } from "../../core/agent-session-runtime.js";
import {
  CACHE_TTL_MS,
  collectCacheMisses,
  computeCacheWaste,
  detectCacheMiss
} from "../../core/cache-stats.js";
import { DEFAULT_THINKING_LEVEL, THINKING_LEVEL_OPTIONS } from "../../core/defaults.js";
import { FooterDataProvider } from "../../core/footer-data-provider.js";
import { configureHttpDispatcher, formatHttpIdleTimeoutMs } from "../../core/http-dispatcher.js";
import { KeybindingsManager } from "../../core/keybindings.js";
import { createCompactionSummaryMessage } from "../../core/messages.js";
import {
  defaultModelPerProvider,
  findExactModelReferenceMatch,
  resolveModelScopeFromModels
} from "../../core/model-resolver.js";
import { CredentialSynchronizationError } from "../../core/model-runtime.js";
import { DefaultPackageManager } from "../../core/package-manager.js";
import { formatMissingSessionCwdPrompt, MissingSessionCwdError } from "../../core/session-cwd.js";
import { SessionManager, sessionEntryToContextMessages } from "../../core/session-manager.js";
import { BUILTIN_SLASH_COMMANDS } from "../../core/slash-commands.js";
import { hasTrustRequiringProjectResources, ProjectTrustStore } from "../../core/trust-manager.js";
import { getUsageCostBreakdown } from "../../core/usage-totals.js";
import { getChangelogPath, getNewEntries, normalizeChangelogLinks, parseChangelog } from "../../utils/changelog.js";
import { copyToClipboard, readClipboardText } from "../../utils/clipboard.js";
import { extensionForImageMimeType, readClipboardImage } from "../../utils/clipboard-image.js";
import { parseGitUrl } from "../../utils/git.js";
import { openBrowser } from "../../utils/open-browser.js";
import { getCwdRelativePath } from "../../utils/paths.js";
import { killTrackedDetachedChildren } from "../../utils/shell.js";
import { loadAllHighlightLanguages } from "../../utils/syntax-highlight.js";
import { ensureTool } from "../../utils/tools-manager.js";
import { checkForNewZyraVersion } from "../../utils/version-check.js";
import { ArminComponent } from "./components/armin.js";
import { AssistantMessageComponent } from "./components/assistant-message.js";
import { BashExecutionComponent } from "./components/bash-execution.js";
import { BranchSummaryMessageComponent } from "./components/branch-summary-message.js";
import { CompactionSummaryMessageComponent } from "./components/compaction-summary-message.js";
import { CustomEditor } from "./components/custom-editor.js";
import { CustomEntryComponent } from "./components/custom-entry.js";
import { CustomMessageComponent } from "./components/custom-message.js";
import { DaxnutsComponent } from "./components/daxnuts.js";
import { DynamicBorder } from "./components/dynamic-border.js";
import { EarendilAnnouncementComponent } from "./components/earendil-announcement.js";
import { ExtensionEditorComponent } from "./components/extension-editor.js";
import { ExtensionInputComponent } from "./components/extension-input.js";
import { ExtensionSelectorComponent } from "./components/extension-selector.js";
import { FooterComponent, formatTokens } from "./components/footer.js";
import { formatKeyText, keyDisplayText, keyHint, keyText, rawKeyHint } from "./components/keybinding-hints.js";
import { LoginDialogComponent } from "./components/login-dialog.js";
import { createMermaidMarkdownTransformer } from "./components/mermaid.js";
import { ModelSelectorComponent } from "./components/model-selector.js";
import {
  formatAuthSelectorProviderType,
  OAuthSelectorComponent
} from "./components/oauth-selector.js";
import { ScopedModelsSelectorComponent } from "./components/scoped-models-selector.js";
import { SessionSelectorComponent } from "./components/session-selector.js";
import { SettingsSelectorComponent } from "./components/settings-selector.js";
import { SkillInvocationMessageComponent } from "./components/skill-invocation-message.js";
import {
  BranchSummaryStatusIndicator,
  CompactionStatusIndicator,
  IdleStatus,
  RetryStatusIndicator,
  WorkingStatusIndicator
} from "./components/status-indicator.js";
import { ThinkingSelectorComponent } from "./components/thinking-selector.js";
import { ToolExecutionComponent } from "./components/tool-execution.js";
import { TreeSelectorComponent } from "./components/tree-selector.js";
import { TrustSelectorComponent } from "./components/trust-selector.js";
import { UserMessageComponent } from "./components/user-message.js";
import { UserMessageSelectorComponent } from "./components/user-message-selector.js";
import { editInExternalEditor } from "./external-editor.js";
import { refreshModelCatalogs } from "./model-catalog-refresh.js";
import { getModelSearchText } from "./model-search.js";
import { shareSession } from "./session-share.js";
import {
  getAvailableThemes,
  getAvailableThemesWithPaths,
  getEditorTheme,
  getMarkdownTheme,
  getThemeByName,
  onThemeChange,
  setRegisteredThemes,
  stopThemeWatcher,
  Theme,
  theme
} from "./theme/theme.js";
import { InteractiveThemeController } from "./theme/theme-controller.js";
function isExpandable(obj) {
  return typeof obj === "object" && obj !== null && "setExpanded" in obj && typeof obj.setExpanded === "function";
}
class ExpandableText extends Text {
  getCollapsedText;
  getExpandedText;
  constructor(getCollapsedText, getExpandedText, expanded = false, paddingX = 0, paddingY = 0) {
    super(expanded ? getExpandedText() : getCollapsedText(), paddingX, paddingY);
    this.getCollapsedText = getCollapsedText;
    this.getExpandedText = getExpandedText;
  }
  setExpanded(expanded) {
    this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
  }
}
function isCustomSessionEntry(item) {
  return "type" in item && item.type === "custom";
}
function isCompactionCostNotice(item) {
  return "type" in item && item.type === "compaction_cost";
}
const DEAD_TERMINAL_ERROR_CODES = /* @__PURE__ */ new Set(["EIO", "EPIPE", "ENOTCONN"]);
function isDeadTerminalError(error) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = error.code;
  return code !== void 0 && DEAD_TERMINAL_ERROR_CODES.has(code);
}
const ANTHROPIC_SUBSCRIPTION_AUTH_WARNING = "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage. Disable this warning in /settings.";
function isAnthropicSubscriptionAuthKey(apiKey) {
  return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}
function isUnknownModel(model) {
  return !!model && model.provider === "unknown" && model.id === "unknown" && model.api === "unknown";
}
function quoteIfNeeded(value) {
  if (value.length > 0 && !/[^a-zA-Z0-9_\-./~:@]/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function formatResumeCommand(sessionManager) {
  if (!process.stdout.isTTY) return void 0;
  if (!sessionManager.isPersisted()) return void 0;
  const sessionFile = sessionManager.getSessionFile();
  if (!sessionFile || !fs.existsSync(sessionFile)) return void 0;
  const args = [APP_NAME];
  if (!sessionManager.usesDefaultSessionDir()) {
    args.push("--session-dir", quoteIfNeeded(sessionManager.getSessionDir()));
  }
  args.push("--session", sessionManager.getSessionId());
  return args.join(" ");
}
function hasDefaultModelProvider(providerId) {
  return providerId in defaultModelPerProvider;
}
function llamaCppPostLoginGuidance(actionLabel, loadedModelCount) {
  return loadedModelCount === 0 ? `${actionLabel}. No llama.cpp models are loaded. Use /llama to load a model, then /model to select it.` : `${actionLabel}. Use /model to select a loaded llama.cpp model, or /llama to manage models.`;
}
const AUTH_TYPE_ORDER = { oauth: 0, api_key: 1 };
function createFuzzyAutocompleteItems(items, prefix, getSearchText, toAutocompleteItem) {
  const filtered = fuzzyFilter(items, prefix, getSearchText);
  if (filtered.length === 0) return null;
  return filtered.map(toAutocompleteItem);
}
function getLoginProviderCompletionOptions(providerOptions) {
  const byId = /* @__PURE__ */ new Map();
  for (const provider of providerOptions) {
    const existing = byId.get(provider.id);
    if (existing) {
      if (!existing.authTypes.includes(provider.authType)) {
        existing.authTypes.push(provider.authType);
        existing.authTypes.sort((a, b) => AUTH_TYPE_ORDER[a] - AUTH_TYPE_ORDER[b]);
      }
      continue;
    }
    byId.set(provider.id, {
      id: provider.id,
      name: provider.name,
      authTypes: [provider.authType]
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function getLoginProviderSearchText(provider) {
  const authTypes = provider.authTypes.map((authType) => `${authType} ${formatAuthSelectorProviderType(authType)}`).join(" ");
  return `${provider.id} ${provider.name} ${authTypes}`;
}
function formatLoginProviderCompletionDescription(provider) {
  const authTypes = provider.authTypes.map(formatAuthSelectorProviderType).join("/");
  return provider.name === provider.id ? authTypes : `${provider.name} \xB7 ${authTypes}`;
}
function createInteractiveTui(options) {
  const terminal = options.terminal ?? new ProcessTerminal();
  if (options.tuiMode === "fullscreen") {
    const styleSearchMatch = (text) => theme.bg("searchMatchBg", theme.fg("searchMatchText", text));
    return new TuiAltScreen(terminal, options.showHardwareCursor, options.logDirectory, {
      searchMatchStyle: (text) => theme.underline(styleSearchMatch(text)),
      searchCurrentMatchStyle: (text) => theme.bold(theme.inverse(styleSearchMatch(text))),
      openUrl: openBrowser,
      onRightClickPaste: options.onRightClickPaste,
      copySelection: async (text) => {
        try {
          await copyToClipboard(text);
          return true;
        } catch {
          return false;
        }
      }
    });
  }
  return new TuiMainScreen(terminal, options.showHardwareCursor, options.logDirectory);
}
function createInteractiveTuiReference(getTui) {
  return new Proxy({}, {
    get: (_target, property) => {
      const tui = getTui();
      const value = Reflect.get(tui, property, tui);
      if (typeof value !== "function") return value;
      let methodTui = tui;
      let method = value;
      return (...args) => {
        const currentTui = getTui();
        if (currentTui !== methodTui) {
          const currentMethod = Reflect.get(currentTui, property, currentTui);
          if (typeof currentMethod !== "function") {
            throw new TypeError(`TUI property ${String(property)} is not callable`);
          }
          methodTui = currentTui;
          method = currentMethod;
        }
        return Reflect.apply(method, methodTui, args);
      };
    },
    set: (_target, property, value) => {
      const tui = getTui();
      return Reflect.set(tui, property, value, tui);
    },
    has: (_target, property) => Reflect.has(getTui(), property),
    getPrototypeOf: () => Reflect.getPrototypeOf(getTui())
  });
}
class InteractiveMode {
  runtimeHost;
  renderer;
  ui;
  mainScreenRenderState;
  loadedResourcesContainer;
  chatContainer;
  documentContainer;
  transcriptScrollView;
  fullscreenLayoutRoot;
  pendingMessagesContainer;
  statusContainer;
  defaultEditor;
  editor;
  editorComponentFactory;
  autocompleteProvider;
  autocompleteProviderWrappers = [];
  fdPath;
  editorContainer;
  activeSelectorToken;
  activeSelectorDispose;
  footer;
  footerContainer;
  footerDataProvider;
  // Stored so the same manager can be injected into custom editors, selectors, and extension UI.
  keybindings;
  version;
  isInitialized = false;
  onInputCallback;
  pendingUserInputs = [];
  activeStatusIndicator = void 0;
  idleStatus = new IdleStatus();
  workingMessage = void 0;
  workingVisible = true;
  workingIndicatorOptions = void 0;
  defaultWorkingMessage = "Working...";
  defaultHiddenThinkingLabel = "Thinking...";
  hiddenThinkingLabel = this.defaultHiddenThinkingLabel;
  lastSigintTime = 0;
  lastEscapeTime = 0;
  changelogMarkdown = void 0;
  startupNoticesShown = false;
  anthropicSubscriptionWarningShown = false;
  // Status line tracking (for mutating immediately-sequential status updates)
  lastStatusSpacer = void 0;
  lastStatusText = void 0;
  managedToolStatusStarted = false;
  // Streaming message tracking
  streamingComponent = void 0;
  streamingMessage = void 0;
  // Tool execution tracking: toolCallId -> component
  pendingTools = /* @__PURE__ */ new Map();
  // Tool output expansion state
  toolOutputExpanded = false;
  // Thinking block visibility state
  hideThinkingBlock = false;
  outputPad = 1;
  mermaidMarkdownTransformer = createMermaidMarkdownTransformer({
    getMode: () => this.settingsManager.getMermaidRenderingMode(),
    theme
  });
  // Skill commands: command name -> skill file path
  skillCommands = /* @__PURE__ */ new Map();
  // Agent subscription unsubscribe function
  unsubscribe;
  signalCleanupHandlers = [];
  // Track if editor is in bash mode (text starts with !)
  isBashMode = false;
  // Track current bash execution component
  bashComponent = void 0;
  // Track pending bash components (shown in pending area, moved to chat on submit)
  pendingBashComponents = [];
  // Auto-compaction state
  autoCompactionEscapeHandler;
  // Auto-retry state
  retryEscapeHandler;
  // Messages queued while compaction is running
  compactionQueuedMessages = [];
  // Shutdown state
  shutdownRequested = false;
  // Extension UI state
  extensionSelector = void 0;
  extensionInput = void 0;
  extensionEditor = void 0;
  extensionTerminalInputSubscriptions = /* @__PURE__ */ new Set();
  // Extension widgets (components rendered above/below the editor)
  extensionWidgetsAbove = /* @__PURE__ */ new Map();
  extensionWidgetsBelow = /* @__PURE__ */ new Map();
  widgetContainerAbove;
  widgetContainerBelow;
  // Custom footer from extension (undefined = use built-in footer)
  customFooter = void 0;
  // Header container that holds the built-in or custom header
  headerContainer;
  // Built-in header (logo + keybinding hints + changelog)
  builtInHeader = void 0;
  // Custom header from extension (undefined = use built-in header)
  customHeader = void 0;
  options;
  onRightClickPaste = () => {
    void this.handleRightClickPaste();
  };
  autoTrustOnReloadCwd;
  themeController;
  // Convenience accessors
  get session() {
    return this.runtimeHost.session;
  }
  get agent() {
    return this.session.agent;
  }
  get sessionManager() {
    return this.session.sessionManager;
  }
  get settingsManager() {
    return this.session.settingsManager;
  }
  constructor(runtimeHost, options = {}) {
    this.runtimeHost = runtimeHost;
    const tuiMode = options.tuiMode ?? this.settingsManager.getTuiMode();
    this.options = { ...options, tuiMode };
    this.autoTrustOnReloadCwd = options.autoTrustOnReloadCwd;
    this.runtimeHost.setBeforeSessionInvalidate(() => {
      this.resetExtensionUI();
    });
    this.runtimeHost.setRebindSession(async () => {
      await this.rebindCurrentSession({ renderBeforeBind: true });
      await this.themeController.applyFromSettings();
    });
    this.version = VERSION;
    this.renderer = createInteractiveTui({
      tuiMode,
      showHardwareCursor: this.settingsManager.getShowHardwareCursor(),
      logDirectory: getAgentDir(),
      onRightClickPaste: this.onRightClickPaste
    });
    this.ui = createInteractiveTuiReference(() => this.renderer);
    this.ui.setClearOnShrink(this.settingsManager.getClearOnShrink());
    this.headerContainer = new Container();
    this.loadedResourcesContainer = new Container();
    this.chatContainer = new Container();
    this.documentContainer = new Container();
    this.documentContainer.addChild(this.headerContainer);
    this.documentContainer.addChild(this.loadedResourcesContainer);
    this.documentContainer.addChild(this.chatContainer);
    this.pendingMessagesContainer = new Container();
    this.statusContainer = new Container();
    this.widgetContainerAbove = new Container();
    this.widgetContainerBelow = new Container();
    this.keybindings = KeybindingsManager.create();
    setKeybindings(this.keybindings);
    const editorPaddingX = this.settingsManager.getEditorPaddingX();
    const autocompleteMaxVisible = this.settingsManager.getAutocompleteMaxVisible();
    this.defaultEditor = new CustomEditor(this.ui, getEditorTheme(), this.keybindings, {
      paddingX: editorPaddingX,
      autocompleteMaxVisible
    });
    this.editor = this.defaultEditor;
    this.editorContainer = new Container();
    this.editorContainer.addChild(this.editor);
    this.footerDataProvider = new FooterDataProvider(this.sessionManager.getCwd());
    this.footer = new FooterComponent(this.session, this.footerDataProvider);
    this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);
    this.footerContainer = new Container();
    this.footerContainer.addChild(this.footer);
    this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
    this.outputPad = this.settingsManager.getOutputPad();
    setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
    this.themeController = new InteractiveThemeController(this.ui, {
      getSettingsManager: () => this.settingsManager,
      showError: (message) => this.showError(message),
      onChanged: () => this.updateEditorBorderColor(),
      initialThemeSetting: options.initialThemeSetting
    });
  }
  getAutocompleteSourceTag(sourceInfo) {
    if (!sourceInfo) {
      return void 0;
    }
    const scopePrefix = sourceInfo.scope === "user" ? "u" : sourceInfo.scope === "project" ? "p" : "t";
    const source = sourceInfo.source.trim();
    if (source === "auto" || source === "local" || source === "cli") {
      return scopePrefix;
    }
    if (source.startsWith("npm:")) {
      return `${scopePrefix}:${source}`;
    }
    const gitSource = parseGitUrl(source);
    if (gitSource) {
      const ref = gitSource.ref ? `@${gitSource.ref}` : "";
      return `${scopePrefix}:git:${gitSource.host}/${gitSource.path}${ref}`;
    }
    return scopePrefix;
  }
  prefixAutocompleteDescription(description, sourceInfo) {
    const sourceTag = this.getAutocompleteSourceTag(sourceInfo);
    if (!sourceTag) {
      return description;
    }
    return description ? `[${sourceTag}] ${description}` : `[${sourceTag}]`;
  }
  getBuiltInCommandConflictDiagnostics(extensionRunner) {
    const builtinNames = new Set(BUILTIN_SLASH_COMMANDS.map((command) => command.name));
    return extensionRunner.getRegisteredCommands().filter((command) => builtinNames.has(command.name)).map((command) => ({
      type: "warning",
      message: command.invocationName === command.name ? `Extension command '/${command.name}' conflicts with built-in interactive command. Skipping in autocomplete.` : `Extension command '/${command.name}' conflicts with built-in interactive command. Available as '/${command.invocationName}'.`,
      path: command.sourceInfo.path
    }));
  }
  createBaseAutocompleteProvider() {
    const slashCommands = BUILTIN_SLASH_COMMANDS.map((command) => ({
      name: command.name,
      description: command.description,
      ...command.argumentHint && { argumentHint: command.argumentHint }
    }));
    const modelCommand = slashCommands.find((command) => command.name === "model");
    if (modelCommand) {
      modelCommand.getArgumentCompletions = (prefix) => {
        const models = this.session.scopedModels.length > 0 ? this.session.scopedModels.map((s) => s.model) : this.session.modelRuntime.getAvailableSnapshot();
        if (models.length === 0) return null;
        const items = models.map((m) => ({
          id: m.id,
          provider: m.provider,
          name: m.name,
          label: `${m.provider}/${m.id}`
        }));
        return createFuzzyAutocompleteItems(items, prefix, getModelSearchText, (item) => ({
          value: item.label,
          label: item.id,
          description: item.provider
        }));
      };
    }
    const thinkingCommand = slashCommands.find((command) => command.name === "thinking");
    if (thinkingCommand) {
      thinkingCommand.getArgumentCompletions = (prefix) => {
        return createFuzzyAutocompleteItems(
          this.session.getAvailableThinkingLevels(),
          prefix,
          (level) => level,
          (level) => ({
            value: level,
            label: level
          })
        );
      };
    }
    const loginCommand = slashCommands.find((command) => command.name === "login");
    if (loginCommand) {
      loginCommand.getArgumentCompletions = (prefix) => {
        const providers = getLoginProviderCompletionOptions(this.getLoginProviderOptions());
        return createFuzzyAutocompleteItems(providers, prefix, getLoginProviderSearchText, (provider) => ({
          value: provider.id,
          label: provider.id,
          description: formatLoginProviderCompletionDescription(provider)
        }));
      };
    }
    const templateCommands = this.session.promptTemplates.map((cmd) => ({
      name: cmd.name,
      description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
      ...cmd.argumentHint && { argumentHint: cmd.argumentHint }
    }));
    const builtinCommandNames = new Set(slashCommands.map((c) => c.name));
    const extensionCommands = this.session.extensionRunner.getRegisteredCommands().filter((cmd) => !builtinCommandNames.has(cmd.name)).map((cmd) => ({
      name: cmd.invocationName,
      description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
      getArgumentCompletions: cmd.getArgumentCompletions
    }));
    this.skillCommands.clear();
    const skillCommandList = [];
    if (this.settingsManager.getEnableSkillCommands()) {
      for (const skill of this.session.resourceLoader.getSkills().skills) {
        const commandName = `skill:${skill.name}`;
        this.skillCommands.set(commandName, skill.filePath);
        skillCommandList.push({
          name: commandName,
          description: this.prefixAutocompleteDescription(skill.description, skill.sourceInfo)
        });
      }
    }
    return new CombinedAutocompleteProvider(
      [...slashCommands, ...templateCommands, ...extensionCommands, ...skillCommandList],
      this.sessionManager.getCwd(),
      this.fdPath
    );
  }
  setupAutocompleteProvider() {
    let provider = this.createBaseAutocompleteProvider();
    const triggerCharacters = [];
    for (const wrapProvider of this.autocompleteProviderWrappers) {
      provider = wrapProvider(provider);
      triggerCharacters.push(...provider.triggerCharacters ?? []);
    }
    if (triggerCharacters.length > 0) {
      provider.triggerCharacters = [...new Set(triggerCharacters)];
    }
    this.autocompleteProvider = provider;
    this.defaultEditor.setAutocompleteProvider(provider);
    if (this.editor !== this.defaultEditor) {
      this.editor.setAutocompleteProvider?.(provider);
    }
  }
  showStartupNoticesIfNeeded() {
    if (this.startupNoticesShown) {
      return;
    }
    this.startupNoticesShown = true;
    if (!this.changelogMarkdown) {
      return;
    }
    if (this.chatContainer.children.length > 0) {
      this.chatContainer.addChild(new Spacer(1));
    }
    this.chatContainer.addChild(new DynamicBorder());
    if (this.settingsManager.getCollapseChangelog()) {
      const versionMatch = this.changelogMarkdown.match(/##\s+\[?(\d+\.\d+\.\d+)\]?/);
      const latestVersion = versionMatch ? versionMatch[1] : this.version;
      const condensedText = `Updated to v${latestVersion}. Use ${theme.bold("/changelog")} to view full changelog.`;
      this.chatContainer.addChild(new Text(condensedText, 1, 0));
    } else {
      this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "What's New")), 1, 0));
      this.chatContainer.addChild(new Spacer(1));
      this.chatContainer.addChild(
        new Markdown(this.changelogMarkdown.trim(), 1, 0, this.getMarkdownThemeWithSettings())
      );
      this.chatContainer.addChild(new Spacer(1));
    }
    this.chatContainer.addChild(new DynamicBorder());
  }
  mountInteractiveTui(tui, components) {
    for (const component of components) tui.addChild(component);
    if (TuiLayouts.isViewportTUI(tui)) {
      if (!this.fullscreenLayoutRoot) throw new Error("Fullscreen layout is not initialized");
      tui.setLayoutRoot(this.fullscreenLayoutRoot);
    }
  }
  stopInteractiveTui(fullscreenExitOutput) {
    if (this.renderer.mode === "fullscreen" && fullscreenExitOutput === "transcript") {
      while (this.renderer.hasOverlayEntries) this.renderer.hideOverlay();
      this.switchTuiMode("regular", false, false);
      this.renderer.renderNow();
    }
    this.ui.stop({ preserveScreen: this.renderer.mode === "fullscreen" });
  }
  switchTuiMode(mode, restoreProgress = true, startRenderer = true) {
    const previousUi = this.renderer;
    if (mode === previousUi.mode) return true;
    if (previousUi.hasOverlayEntries) return false;
    const components = [...previousUi.children];
    const focus = previousUi.getFocusedComponent();
    const terminal = previousUi.terminal;
    const showHardwareCursor = previousUi.getShowHardwareCursor();
    const clearOnShrink = previousUi.getClearOnShrink();
    const onDebug = previousUi.onDebug;
    if (previousUi instanceof TuiMainScreen) {
      this.mainScreenRenderState = previousUi.captureRenderState();
    }
    previousUi.stop({ preserveScreen: true });
    previousUi.setFocus(null);
    previousUi.clear();
    if (TuiLayouts.isViewportTUI(previousUi)) previousUi.setLayoutRoot(void 0);
    const nextUi = createInteractiveTui({
      tuiMode: mode,
      showHardwareCursor,
      logDirectory: getAgentDir(),
      terminal,
      onRightClickPaste: this.onRightClickPaste
    });
    nextUi.setClearOnShrink(clearOnShrink);
    nextUi.onDebug = onDebug;
    if (nextUi instanceof TuiMainScreen && this.mainScreenRenderState) {
      nextUi.restoreRenderState(this.mainScreenRenderState);
    }
    this.renderer = nextUi;
    this.options.tuiMode = mode;
    this.mountInteractiveTui(nextUi, components);
    nextUi.invalidate();
    nextUi.setFocus(focus);
    if (!startRenderer) return true;
    nextUi.start();
    this.themeController.rebindTui();
    this.rebindExtensionTerminalInputListeners();
    if (restoreProgress && this.settingsManager.getShowTerminalProgress() && (this.session.isStreaming || this.session.isCompacting)) {
      terminal.setProgress(true);
    }
    return true;
  }
  async init() {
    if (this.isInitialized) return;
    this.registerSignalHandlers();
    this.changelogMarkdown = this.getChangelogForDisplay();
    if (this.session.scopedModels.length > 0 && (this.options.verbose || !this.settingsManager.getQuietStartup())) {
      const modelList = this.session.scopedModels.map((sm) => {
        const thinkingStr = sm.thinkingLevel ? `:${sm.thinkingLevel}` : "";
        return `${sm.model.id}${thinkingStr}`;
      }).join(", ");
      const cycleKeys = this.keybindings.getKeys("app.model.cycleForward");
      const cycleHint = cycleKeys.length > 0 ? theme.fg("muted", ` (${formatKeyText(cycleKeys.join("/"), { capitalize: true })} to cycle)`) : "";
      console.log(theme.fg("dim", `Model scope: ${modelList}${cycleHint}`));
    }
    this.renderWidgets();
    this.transcriptScrollView = new TuiLayouts.ScrollView(this.documentContainer, {
      follow: "end",
      primary: true,
      overscroll: "chain",
      scrollbar: this.settingsManager.getFullscreenScrollbar(),
      scrollbarStyle: (text) => theme.bg("scrollbarThumb", text)
    });
    const dock = new TuiLayouts.VStack([
      { component: this.pendingMessagesContainer, shrink: 1, minSize: 0 },
      { component: this.statusContainer, shrink: 1, minSize: 0 },
      { component: this.widgetContainerAbove, shrink: 1, minSize: 0 },
      { component: this.editorContainer, shrink: 1, minSize: 3 },
      { component: this.widgetContainerBelow, shrink: 1, minSize: 0 },
      { component: this.footerContainer, shrink: 1, minSize: 1 }
    ]);
    this.fullscreenLayoutRoot = new TuiLayouts.VStack([
      { component: this.transcriptScrollView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
      { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 }
    ]);
    this.mountInteractiveTui(this.renderer, [
      this.documentContainer,
      this.pendingMessagesContainer,
      this.statusContainer,
      this.widgetContainerAbove,
      this.editorContainer,
      this.widgetContainerBelow,
      this.footerContainer
    ]);
    this.defaultEditor.onAction("app.clear", () => this.handleCtrlC());
    this.defaultEditor.onCtrlD = () => this.handleCtrlD();
    this.defaultEditor.onSubmit = (text) => this.handleStartupSubmit(text);
    this.ui.setFocus(this.editor);
    this.ui.start();
    this.isInitialized = true;
    await this.themeController.applyFromSettings();
    if (this.options.verbose || !this.settingsManager.getQuietStartup()) {
      const logo = theme.bold(theme.fg("accent", APP_NAME)) + theme.fg("dim", ` v${this.version}`);
      const hint = (keybinding, description) => keyHint(keybinding, description);
      const expandedInstructions = [
        hint("app.interrupt", "to interrupt"),
        hint("app.clear", "to clear"),
        rawKeyHint(`${keyText("app.clear")} twice`, "to exit"),
        hint("app.exit", "to exit (empty)"),
        hint("app.suspend", "to suspend"),
        keyHint("tui.editor.deleteToLineEnd", "to delete to end"),
        hint("app.thinking.cycle", "to cycle thinking level"),
        rawKeyHint(`${keyText("app.model.cycleForward")}/${keyText("app.model.cycleBackward")}`, "to cycle models"),
        hint("app.model.select", "to select model"),
        hint("app.tools.expand", "to expand tools"),
        hint("app.thinking.toggle", "to expand thinking"),
        hint("app.editor.external", "for external editor"),
        rawKeyHint("/", "for commands"),
        rawKeyHint("!", "to run bash"),
        rawKeyHint("!!", "to run bash (no context)"),
        hint("app.message.followUp", "to queue follow-up"),
        hint("app.message.dequeue", "to edit all queued messages"),
        hint("app.clipboard.pasteImage", "to paste image (with text fallback)"),
        rawKeyHint("drop files", "to attach")
      ].join("\n");
      const compactInstructions = [
        hint("app.interrupt", "interrupt"),
        rawKeyHint(`${keyText("app.clear")}/${keyText("app.exit")}`, "clear/exit"),
        rawKeyHint("/", "commands"),
        rawKeyHint("!", "bash"),
        hint("app.tools.expand", "more")
      ].join(theme.fg("muted", " \xB7 "));
      const compactOnboarding = theme.fg(
        "dim",
        `Press ${keyText("app.tools.expand")} to show full startup help and loaded resources.`
      );
      const onboarding = theme.fg(
        "dim",
        `Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.`
      );
      this.builtInHeader = new ExpandableText(
        () => `${logo}
${compactInstructions}
${compactOnboarding}

${onboarding}`,
        () => `${logo}
${expandedInstructions}

${onboarding}`,
        this.getStartupExpansionState(),
        1,
        0
      );
      this.headerContainer.addChild(new Spacer(1));
      this.headerContainer.addChild(this.builtInHeader);
      this.headerContainer.addChild(new Spacer(1));
    } else {
      this.builtInHeader = new Text("", 0, 0);
      this.headerContainer.addChild(this.builtInHeader);
    }
    this.ui.requestRender();
    const [fdPath] = await Promise.all([
      ensureTool("fd", (status) => this.showManagedToolStatus(status)),
      ensureTool("rg", (status) => this.showManagedToolStatus(status))
    ]);
    this.fdPath = fdPath;
    this.setupKeyHandlers();
    this.setupEditorSubmitHandler();
    this.ui.requestRender();
    await this.rebindCurrentSession();
    this.renderInitialMessages();
    onThemeChange(() => {
      this.ui.invalidate();
      this.updateEditorBorderColor();
      this.ui.requestRender();
    });
    this.footerDataProvider.onBranchChange(() => {
      this.ui.requestRender();
    });
    await this.updateAvailableProviderCount();
    this.ui.renderNow();
    void loadAllHighlightLanguages().then(() => {
      if (!this.isInitialized) return;
      this.ui.invalidate();
      this.ui.requestRender();
    });
  }
  /**
   * Update terminal title with session name and cwd.
   */
  updateTerminalTitle() {
    const cwdBasename = path.basename(this.sessionManager.getCwd());
    const sessionName = this.sessionManager.getSessionName();
    if (sessionName) {
      this.ui.terminal.setTitle(`${APP_TITLE} - ${sessionName} - ${cwdBasename}`);
    } else {
      this.ui.terminal.setTitle(`${APP_TITLE} - ${cwdBasename}`);
    }
  }
  /**
   * Run the interactive mode. This is the main entry point.
   * Initializes the UI, shows warnings, processes initial messages, and starts the interactive loop.
   */
  async run() {
    await this.init();
    if (!process.env.ZYRA_OFFLINE) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15e3);
      void refreshModelCatalogs(this.session.modelRuntime, controller.signal).then(() => this.updateAvailableProviderCount()).catch(() => {
      }).finally(() => clearTimeout(timeout));
    }
    checkForNewZyraVersion(this.version).then((newRelease) => {
      if (newRelease) {
        this.showNewVersionNotification(newRelease);
      }
    });
    this.checkForPackageUpdates().then((updates) => {
      if (updates.length > 0) {
        this.showPackageUpdateNotification(updates);
      }
    }).finally(() => {
      if (process.platform === "win32" && this.isInitialized) {
        this.updateTerminalTitle();
      }
    });
    this.checkTmuxKeyboardSetup().then((warning) => {
      if (warning) {
        this.showWarning(warning);
      }
    });
    const {
      migratedProviders,
      startupDiagnostics,
      modelFallbackMessage,
      initialMessage,
      initialImages,
      initialMessages
    } = this.options;
    for (const diagnostic of startupDiagnostics ?? []) {
      if (diagnostic.type === "error") {
        this.showError(diagnostic.message);
      } else if (diagnostic.type === "warning") {
        this.showWarning(diagnostic.message);
      } else {
        this.showStatus(diagnostic.message);
      }
    }
    if (migratedProviders && migratedProviders.length > 0) {
      this.showWarning(`Migrated credentials to auth.json: ${migratedProviders.join(", ")}`);
    }
    const modelsJsonError = this.session.modelRuntime.getError();
    if (modelsJsonError) {
      this.showError(`models.json error: ${modelsJsonError}`);
    }
    if (modelFallbackMessage) {
      this.showWarning(modelFallbackMessage);
    }
    void this.maybeWarnAboutAnthropicSubscriptionAuth();
    if (initialMessage) {
      try {
        await this.session.prompt(initialMessage, { images: initialImages });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        this.showError(errorMessage);
      }
    }
    if (initialMessages) {
      for (const message of initialMessages) {
        try {
          await this.session.prompt(message);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          this.showError(errorMessage);
        }
      }
    }
    while (true) {
      const userInput = await this.getUserInput();
      try {
        await this.session.prompt(userInput);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        this.showError(errorMessage);
      }
    }
  }
  async checkForPackageUpdates() {
    if (process.env.ZYRA_OFFLINE) {
      return [];
    }
    try {
      const packageManager = new DefaultPackageManager({
        cwd: this.sessionManager.getCwd(),
        agentDir: getAgentDir(),
        settingsManager: this.settingsManager
      });
      const updates = await packageManager.checkForAvailableUpdates();
      return updates.map((update) => update.displayName);
    } catch {
      return [];
    }
  }
  async checkTmuxKeyboardSetup() {
    if (!process.env.TMUX) return void 0;
    const runTmuxShow = (option) => {
      return new Promise((resolve) => {
        const proc = spawn("tmux", ["show", "-gv", option], {
          stdio: ["ignore", "pipe", "ignore"]
        });
        let stdout = "";
        const timer = setTimeout(() => {
          proc.kill();
          resolve(void 0);
        }, 2e3);
        proc.stdout?.on("data", (data) => {
          stdout += data.toString();
        });
        proc.on("error", () => {
          clearTimeout(timer);
          resolve(void 0);
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          resolve(code === 0 ? stdout.trim() : void 0);
        });
      });
    };
    const [extendedKeys, extendedKeysFormat] = await Promise.all([
      runTmuxShow("extended-keys"),
      runTmuxShow("extended-keys-format")
    ]);
    if (extendedKeys === void 0) return void 0;
    if (extendedKeys !== "on" && extendedKeys !== "always") {
      return "tmux extended-keys is off. Modified Enter keys may not work. Add `set -g extended-keys on` to ~/.tmux.conf and restart tmux.";
    }
    if (extendedKeysFormat === "xterm") {
      return "tmux extended-keys-format is xterm. Zyra works best with csi-u. Add `set -g extended-keys-format csi-u` to ~/.tmux.conf and restart tmux.";
    }
    return void 0;
  }
  /**
   * Get changelog entries to display on startup.
   * Only shows new entries since last seen version, skips for resumed sessions.
   */
  getChangelogForDisplay() {
    if (this.session.state.messages.length > 0) {
      return void 0;
    }
    const lastVersion = this.settingsManager.getLastChangelogVersion();
    const changelogPath = getChangelogPath();
    const entries = parseChangelog(changelogPath);
    if (!lastVersion) {
      this.settingsManager.setLastChangelogVersion(VERSION);
      this.reportInstallTelemetry(VERSION);
      return void 0;
    }
    const newEntries = getNewEntries(entries, lastVersion);
    if (newEntries.length > 0) {
      this.settingsManager.setLastChangelogVersion(VERSION);
      this.reportInstallTelemetry(VERSION);
      return newEntries.map((e) => normalizeChangelogLinks(e.content, e)).join("\n\n");
    }
    return void 0;
  }
  reportInstallTelemetry(_version) {
  }
  getMarkdownThemeWithSettings() {
    return {
      ...getMarkdownTheme(),
      codeBlockIndent: this.settingsManager.getCodeBlockIndent()
    };
  }
  // =========================================================================
  // Extension System
  // =========================================================================
  formatDisplayPath(p) {
    const home = os.homedir();
    let result = p;
    if (result.startsWith(home)) {
      result = `~${result.slice(home.length)}`;
    }
    return result;
  }
  formatExtensionDisplayPath(path2) {
    let result = this.formatDisplayPath(path2);
    result = result.replace(/\/index\.ts$/, "").replace(/\/index\.js$/, "");
    return result;
  }
  formatContextPath(p) {
    const cwd = path.resolve(this.sessionManager.getCwd());
    const absolutePath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(cwd, p);
    const relativePath = getCwdRelativePath(absolutePath, cwd);
    if (relativePath !== void 0) {
      return relativePath;
    }
    return this.formatDisplayPath(absolutePath);
  }
  getStartupExpansionState() {
    return this.options.verbose || this.toolOutputExpanded;
  }
  /**
   * Get a short path relative to the package root for display.
   */
  getShortPath(fullPath, sourceInfo) {
    const normalizedFullPath = fullPath.replace(/\\/g, "/");
    const baseDir = sourceInfo?.baseDir;
    if (baseDir && this.isPackageSource(sourceInfo)) {
      const normalizedBaseDir = baseDir.replace(/\\/g, "/");
      const npmRootMatch = normalizedBaseDir.match(/^(.*\/node_modules)\/(@?[^/]+(?:\/[^/]+)?)$/);
      if (npmRootMatch?.[1] && normalizedFullPath.startsWith(`${npmRootMatch[1]}/`)) {
        return path.posix.relative(normalizedBaseDir, normalizedFullPath);
      }
      const relativePath = path.relative(path.resolve(baseDir), path.resolve(fullPath));
      if (relativePath && relativePath !== "." && !relativePath.startsWith("..") && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)) {
        return relativePath.replace(/\\/g, "/");
      }
    }
    const source = sourceInfo?.source ?? "";
    const npmMatch = normalizedFullPath.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)\/(.*)/);
    if (npmMatch && source.startsWith("npm:")) {
      return npmMatch[2];
    }
    const gitMatch = normalizedFullPath.match(/git\/[^/]+\/[^/]+\/(.*)/);
    if (gitMatch && source.startsWith("git:")) {
      return gitMatch[1];
    }
    return this.formatDisplayPath(fullPath);
  }
  getCompactPathLabel(resourcePath, sourceInfo) {
    const shortPath = this.getShortPath(resourcePath, sourceInfo);
    const normalizedPath = shortPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter((segment) => segment.length > 0 && segment !== "~");
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
    return shortPath;
  }
  getCompactPackageSourceLabel(sourceInfo) {
    const source = sourceInfo?.source ?? "";
    if (source.startsWith("npm:")) {
      return source.slice("npm:".length) || source;
    }
    const gitSource = parseGitUrl(source);
    if (gitSource) {
      return gitSource.path || source;
    }
    return source;
  }
  getCompactExtensionLabel(resourcePath, sourceInfo) {
    if (!this.isPackageSource(sourceInfo)) {
      return this.getCompactPathLabel(resourcePath, sourceInfo);
    }
    const sourceLabel = this.getCompactPackageSourceLabel(sourceInfo);
    if (!sourceLabel) {
      return this.getCompactPathLabel(resourcePath, sourceInfo);
    }
    const shortPath = this.getShortPath(resourcePath, sourceInfo).replace(/\\/g, "/");
    const packagePath = shortPath.startsWith("extensions/") ? shortPath.slice("extensions/".length) : shortPath;
    const parsedPath = path.posix.parse(packagePath);
    if (parsedPath.name === "index") {
      return !parsedPath.dir || parsedPath.dir === "." ? sourceLabel : `${sourceLabel}:${parsedPath.dir}`;
    }
    return `${sourceLabel}:${packagePath}`;
  }
  getCompactDisplayPathSegments(resourcePath) {
    return this.formatDisplayPath(resourcePath).replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0 && segment !== "~");
  }
  getCompactNonPackageExtensionLabel(resourcePath, index, allPaths) {
    const segments = allPaths[index]?.segments;
    if (!segments || segments.length === 0) {
      return this.getCompactPathLabel(resourcePath);
    }
    for (let segmentCount = 1; segmentCount <= segments.length; segmentCount += 1) {
      const candidate = segments.slice(-segmentCount).join("/");
      const isUnique = allPaths.every((item, itemIndex) => {
        if (itemIndex === index) {
          return true;
        }
        return item.segments.slice(-segmentCount).join("/") !== candidate;
      });
      if (isUnique) {
        return candidate;
      }
    }
    return segments.join("/");
  }
  getCompactExtensionLabels(extensions) {
    const nonPackageExtensions = extensions.map((extension) => {
      const segments = this.getCompactDisplayPathSegments(extension.path);
      const lastSegment = segments[segments.length - 1];
      if (segments.length > 1 && (lastSegment === "index.ts" || lastSegment === "index.js")) {
        segments.pop();
      }
      return {
        path: extension.path,
        sourceInfo: extension.sourceInfo,
        segments
      };
    }).filter((extension) => !this.isPackageSource(extension.sourceInfo));
    return extensions.map((extension) => {
      if (this.isPackageSource(extension.sourceInfo)) {
        return this.getCompactExtensionLabel(extension.path, extension.sourceInfo);
      }
      const nonPackageIndex = nonPackageExtensions.findIndex((item) => item.path === extension.path);
      if (nonPackageIndex === -1) {
        return this.getCompactPathLabel(extension.path, extension.sourceInfo);
      }
      return this.getCompactNonPackageExtensionLabel(extension.path, nonPackageIndex, nonPackageExtensions);
    });
  }
  getDisplaySourceInfo(sourceInfo) {
    const source = sourceInfo?.source ?? "local";
    const scope = sourceInfo?.scope ?? "project";
    if (source === "local") {
      if (scope === "user") {
        return { label: "user", color: "muted" };
      }
      if (scope === "project") {
        return { label: "project", color: "muted" };
      }
      if (scope === "temporary") {
        return { label: "path", scopeLabel: "temp", color: "muted" };
      }
      return { label: "path", color: "muted" };
    }
    if (source === "cli") {
      return { label: "path", scopeLabel: scope === "temporary" ? "temp" : void 0, color: "muted" };
    }
    const scopeLabel = scope === "user" ? "user" : scope === "project" ? "project" : scope === "temporary" ? "temp" : void 0;
    return { label: source, scopeLabel, color: "accent" };
  }
  getScopeGroup(sourceInfo) {
    const source = sourceInfo?.source ?? "local";
    const scope = sourceInfo?.scope ?? "project";
    if (source === "cli" || scope === "temporary") return "path";
    if (scope === "user") return "user";
    if (scope === "project") return "project";
    return "path";
  }
  isPackageSource(sourceInfo) {
    const source = sourceInfo?.source ?? "";
    return source.startsWith("npm:") || source.startsWith("git:");
  }
  buildScopeGroups(items) {
    const groups = {
      user: { scope: "user", paths: [], packages: /* @__PURE__ */ new Map() },
      project: { scope: "project", paths: [], packages: /* @__PURE__ */ new Map() },
      path: { scope: "path", paths: [], packages: /* @__PURE__ */ new Map() }
    };
    for (const item of items) {
      const groupKey = this.getScopeGroup(item.sourceInfo);
      const group = groups[groupKey];
      const source = item.sourceInfo?.source ?? "local";
      if (this.isPackageSource(item.sourceInfo)) {
        const list = group.packages.get(source) ?? [];
        list.push(item);
        group.packages.set(source, list);
      } else {
        group.paths.push(item);
      }
    }
    return [groups.project, groups.user, groups.path].filter(
      (group) => group.paths.length > 0 || group.packages.size > 0
    );
  }
  formatScopeGroups(groups, options) {
    const lines = [];
    for (const group of groups) {
      lines.push(`  ${theme.fg("accent", group.scope)}`);
      const sortedPaths = [...group.paths].sort((a, b) => a.path.localeCompare(b.path));
      for (const item of sortedPaths) {
        lines.push(theme.fg("dim", `    ${options.formatPath(item)}`));
      }
      const sortedPackages = Array.from(group.packages.entries()).sort(([a], [b]) => a.localeCompare(b));
      for (const [source, items] of sortedPackages) {
        lines.push(`    ${theme.fg("mdLink", source)}`);
        const sortedPackagePaths = [...items].sort((a, b) => a.path.localeCompare(b.path));
        for (const item of sortedPackagePaths) {
          lines.push(theme.fg("dim", `      ${options.formatPackagePath(item, source)}`));
        }
      }
    }
    return lines.join("\n");
  }
  findSourceInfoForPath(p, sourceInfos) {
    const exact = sourceInfos.get(p);
    if (exact) return exact;
    let current = p;
    while (current.includes("/")) {
      current = current.substring(0, current.lastIndexOf("/"));
      const parent = sourceInfos.get(current);
      if (parent) return parent;
    }
    return void 0;
  }
  formatPathWithSource(p, sourceInfo) {
    if (sourceInfo) {
      const shortPath = this.getShortPath(p, sourceInfo);
      const { label, scopeLabel } = this.getDisplaySourceInfo(sourceInfo);
      const labelText = scopeLabel ? `${label} (${scopeLabel})` : label;
      return `${labelText} ${shortPath}`;
    }
    return this.formatDisplayPath(p);
  }
  formatDiagnostics(diagnostics, sourceInfos) {
    const lines = [];
    const collisions = /* @__PURE__ */ new Map();
    const otherDiagnostics = [];
    for (const d of diagnostics) {
      if (d.type === "collision" && d.collision) {
        const list = collisions.get(d.collision.name) ?? [];
        list.push(d);
        collisions.set(d.collision.name, list);
      } else {
        otherDiagnostics.push(d);
      }
    }
    for (const [name, collisionList] of collisions) {
      const first = collisionList[0]?.collision;
      if (!first) continue;
      lines.push(theme.fg("warning", `  "${name}" collision:`));
      lines.push(
        theme.fg(
          "dim",
          `    ${theme.fg("success", "\u2713")} ${this.formatPathWithSource(first.winnerPath, this.findSourceInfoForPath(first.winnerPath, sourceInfos))}`
        )
      );
      for (const d of collisionList) {
        if (d.collision) {
          lines.push(
            theme.fg(
              "dim",
              `    ${theme.fg("warning", "\u2717")} ${this.formatPathWithSource(d.collision.loserPath, this.findSourceInfoForPath(d.collision.loserPath, sourceInfos))} (skipped)`
            )
          );
        }
      }
    }
    for (const d of otherDiagnostics) {
      if (d.path) {
        const formattedPath = this.formatPathWithSource(d.path, this.findSourceInfoForPath(d.path, sourceInfos));
        lines.push(theme.fg(d.type === "error" ? "error" : "warning", `  ${formattedPath}`));
        lines.push(theme.fg(d.type === "error" ? "error" : "warning", `    ${d.message}`));
      } else {
        lines.push(theme.fg(d.type === "error" ? "error" : "warning", `  ${d.message}`));
      }
    }
    return lines.join("\n");
  }
  showLoadedResources(options) {
    this.loadedResourcesContainer.clear();
    const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();
    const showDiagnostics = showListing || options?.showDiagnosticsWhenQuiet === true;
    if (!showListing && !showDiagnostics) {
      return;
    }
    const sectionHeader = (name, color = "mdHeading") => theme.fg(color, `[${name}]`);
    const formatCompactList = (items, options2) => {
      const labels = items.map((item) => item.trim()).filter((item) => item.length > 0);
      if (options2?.sort !== false) {
        labels.sort((a, b) => a.localeCompare(b));
      }
      return theme.fg("dim", `  ${labels.join(", ")}`);
    };
    const addLoadedSection = (name, collapsedBody, expandedBody = collapsedBody, color = "mdHeading") => {
      const section = new ExpandableText(
        () => `${sectionHeader(name, color)}
${collapsedBody}`,
        () => `${sectionHeader(name, color)}
${expandedBody}`,
        this.getStartupExpansionState(),
        0,
        0
      );
      this.loadedResourcesContainer.addChild(section);
      this.loadedResourcesContainer.addChild(new Spacer(1));
    };
    const skillsResult = this.session.resourceLoader.getSkills();
    const promptsResult = this.session.resourceLoader.getPrompts();
    const themesResult = this.session.resourceLoader.getThemes();
    const extensions = options?.extensions ?? this.session.resourceLoader.getExtensions().extensions.filter((extension) => !extension.hidden).map((extension) => ({
      path: extension.path,
      sourceInfo: extension.sourceInfo
    }));
    const sourceInfos = /* @__PURE__ */ new Map();
    for (const extension of extensions) {
      if (extension.sourceInfo) {
        sourceInfos.set(extension.path, extension.sourceInfo);
      }
    }
    for (const skill of skillsResult.skills) {
      if (skill.sourceInfo) {
        sourceInfos.set(skill.filePath, skill.sourceInfo);
      }
    }
    for (const prompt of promptsResult.prompts) {
      if (prompt.sourceInfo) {
        sourceInfos.set(prompt.filePath, prompt.sourceInfo);
      }
    }
    for (const loadedTheme of themesResult.themes) {
      if (loadedTheme.sourcePath && loadedTheme.sourceInfo) {
        sourceInfos.set(loadedTheme.sourcePath, loadedTheme.sourceInfo);
      }
    }
    if (showListing) {
      const systemPromptSource = this.session.resourceLoader.getSystemPromptSource();
      const contextFiles = [
        ...systemPromptSource ? [systemPromptSource] : [],
        ...this.session.resourceLoader.getAppendSystemPromptSources(),
        ...this.session.resourceLoader.getAgentsFiles().agentsFiles
      ];
      if (contextFiles.length > 0) {
        this.loadedResourcesContainer.addChild(new Spacer(1));
        const contextList = contextFiles.map((f) => theme.fg("dim", `  ${this.formatDisplayPath(f.path)}`)).join("\n");
        const contextCompactList = formatCompactList(
          contextFiles.map((contextFile) => this.formatContextPath(contextFile.path)),
          { sort: false }
        );
        addLoadedSection("Context", contextCompactList, contextList);
      }
      const skills = skillsResult.skills;
      if (skills.length > 0) {
        const groups = this.buildScopeGroups(
          skills.map((skill) => ({ path: skill.filePath, sourceInfo: skill.sourceInfo }))
        );
        const skillList = this.formatScopeGroups(groups, {
          formatPath: (item) => this.formatDisplayPath(item.path),
          formatPackagePath: (item) => this.getShortPath(item.path, item.sourceInfo)
        });
        const skillCompactList = formatCompactList(skills.map((skill) => skill.name));
        addLoadedSection("Skills", skillCompactList, skillList);
      }
      const templates = this.session.promptTemplates;
      if (templates.length > 0) {
        const groups = this.buildScopeGroups(
          templates.map((template) => ({ path: template.filePath, sourceInfo: template.sourceInfo }))
        );
        const templateByPath = new Map(templates.map((t) => [t.filePath, t]));
        const templateList = this.formatScopeGroups(groups, {
          formatPath: (item) => {
            const template = templateByPath.get(item.path);
            return template ? `/${template.name}` : this.formatDisplayPath(item.path);
          },
          formatPackagePath: (item) => {
            const template = templateByPath.get(item.path);
            return template ? `/${template.name}` : this.formatDisplayPath(item.path);
          }
        });
        const promptCompactList = formatCompactList(templates.map((template) => `/${template.name}`));
        addLoadedSection("Prompts", promptCompactList, templateList);
      }
      if (extensions.length > 0) {
        const groups = this.buildScopeGroups(extensions);
        const extList = this.formatScopeGroups(groups, {
          formatPath: (item) => this.formatExtensionDisplayPath(item.path),
          formatPackagePath: (item) => this.formatExtensionDisplayPath(this.getShortPath(item.path, item.sourceInfo))
        });
        const extensionCompactList = formatCompactList(this.getCompactExtensionLabels(extensions));
        addLoadedSection("Extensions", extensionCompactList, extList, "mdHeading");
      }
      const loadedThemes = themesResult.themes;
      const customThemes = loadedThemes.filter((t) => t.sourcePath);
      if (customThemes.length > 0) {
        const groups = this.buildScopeGroups(
          customThemes.map((loadedTheme) => ({
            path: loadedTheme.sourcePath,
            sourceInfo: loadedTheme.sourceInfo
          }))
        );
        const themeList = this.formatScopeGroups(groups, {
          formatPath: (item) => this.formatDisplayPath(item.path),
          formatPackagePath: (item) => this.getShortPath(item.path, item.sourceInfo)
        });
        const themeCompactList = formatCompactList(
          customThemes.map(
            (loadedTheme) => loadedTheme.name ?? this.getCompactPathLabel(loadedTheme.sourcePath, loadedTheme.sourceInfo)
          )
        );
        addLoadedSection("Themes", themeCompactList, themeList);
      }
    }
    if (showDiagnostics) {
      const skillDiagnostics = skillsResult.diagnostics;
      if (skillDiagnostics.length > 0) {
        const warningLines = this.formatDiagnostics(skillDiagnostics, sourceInfos);
        this.loadedResourcesContainer.addChild(
          new Text(`${theme.fg("warning", "[Skill conflicts]")}
${warningLines}`, 0, 0)
        );
        this.loadedResourcesContainer.addChild(new Spacer(1));
      }
      const promptDiagnostics = promptsResult.diagnostics;
      if (promptDiagnostics.length > 0) {
        const warningLines = this.formatDiagnostics(promptDiagnostics, sourceInfos);
        this.loadedResourcesContainer.addChild(
          new Text(`${theme.fg("warning", "[Prompt conflicts]")}
${warningLines}`, 0, 0)
        );
        this.loadedResourcesContainer.addChild(new Spacer(1));
      }
      const extensionDiagnostics = [];
      const extensionErrors = this.session.resourceLoader.getExtensions().errors;
      if (extensionErrors.length > 0) {
        for (const error of extensionErrors) {
          extensionDiagnostics.push({ type: "error", message: error.error, path: error.path });
        }
      }
      const commandDiagnostics = this.session.extensionRunner.getCommandDiagnostics();
      extensionDiagnostics.push(...commandDiagnostics);
      extensionDiagnostics.push(...this.getBuiltInCommandConflictDiagnostics(this.session.extensionRunner));
      const shortcutDiagnostics = this.session.extensionRunner.getShortcutDiagnostics();
      extensionDiagnostics.push(...shortcutDiagnostics);
      if (extensionDiagnostics.length > 0) {
        const warningLines = this.formatDiagnostics(extensionDiagnostics, sourceInfos);
        this.loadedResourcesContainer.addChild(
          new Text(`${theme.fg("warning", "[Extension issues]")}
${warningLines}`, 0, 0)
        );
        this.loadedResourcesContainer.addChild(new Spacer(1));
      }
      const themeDiagnostics = themesResult.diagnostics;
      if (themeDiagnostics.length > 0) {
        const warningLines = this.formatDiagnostics(themeDiagnostics, sourceInfos);
        this.loadedResourcesContainer.addChild(
          new Text(`${theme.fg("warning", "[Theme conflicts]")}
${warningLines}`, 0, 0)
        );
        this.loadedResourcesContainer.addChild(new Spacer(1));
      }
    }
  }
  /**
   * Initialize the extension system with TUI-based UI context.
   */
  async bindCurrentSessionExtensions() {
    const uiContext = this.createExtensionUIContext();
    await this.session.bindExtensions({
      uiContext,
      mode: "tui",
      abortHandler: () => {
        this.restoreQueuedMessagesToEditor({ abort: true });
      },
      commandContextActions: {
        waitForIdle: () => this.session.waitForIdle(),
        newSession: async (options) => {
          this.clearStatusIndicator();
          try {
            return await this.runtimeHost.newSession(options);
          } catch (error) {
            return this.handleFatalRuntimeError("Failed to create session", error);
          }
        },
        fork: async (entryId, options) => {
          try {
            const result = await this.runtimeHost.fork(entryId, options);
            if (!result.cancelled) {
              this.editor.setText(result.selectedText ?? "");
              this.showStatus("Forked to new session");
            }
            return { cancelled: result.cancelled };
          } catch (error) {
            return this.handleFatalRuntimeError("Failed to fork session", error);
          }
        },
        navigateTree: async (targetId, options) => {
          const result = await this.session.navigateTree(targetId, {
            summarize: options?.summarize,
            customInstructions: options?.customInstructions,
            replaceInstructions: options?.replaceInstructions,
            label: options?.label
          });
          if (result.cancelled) {
            return { cancelled: true };
          }
          this.chatContainer.clear();
          this.renderInitialMessages();
          if (result.editorText && !this.editor.getText().trim()) {
            this.editor.setText(result.editorText);
          }
          this.showStatus("Navigated to selected point");
          void this.flushCompactionQueue({ willRetry: false });
          return { cancelled: false };
        },
        switchSession: async (sessionPath, options) => {
          return this.handleResumeSession(sessionPath, options);
        },
        reload: async () => {
          await this.handleReloadCommand();
        }
      },
      shutdownHandler: () => {
        this.shutdownRequested = true;
        if (this.session.isIdle) {
          void this.shutdown();
        }
      },
      onError: (error) => {
        this.showExtensionError(error.extensionPath, error.error, error.stack);
      }
    });
    setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
    this.setupAutocompleteProvider();
    const extensionRunner = this.session.extensionRunner;
    this.setupExtensionShortcuts(extensionRunner);
    this.showLoadedResources({ force: false, showDiagnosticsWhenQuiet: true });
    this.showStartupNoticesIfNeeded();
  }
  applyFullscreenScrollbarSetting() {
    this.transcriptScrollView?.setScrollbar(this.settingsManager.getFullscreenScrollbar());
  }
  applyRuntimeSettings() {
    configureHttpDispatcher(this.settingsManager.getHttpIdleTimeoutMs());
    this.applyFullscreenScrollbarSetting();
    this.footer.setSession(this.session);
    this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);
    this.footerDataProvider.setCwd(this.sessionManager.getCwd());
    this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
    this.outputPad = this.settingsManager.getOutputPad();
    this.ui.setShowHardwareCursor(this.settingsManager.getShowHardwareCursor());
    const clearOnShrink = this.settingsManager.getClearOnShrink();
    this.ui.setClearOnShrink(clearOnShrink);
    if (!clearOnShrink && !this.activeStatusIndicator) {
      this.statusContainer.clear();
    }
    const editorPaddingX = this.settingsManager.getEditorPaddingX();
    const autocompleteMaxVisible = this.settingsManager.getAutocompleteMaxVisible();
    this.defaultEditor.setPaddingX(editorPaddingX);
    this.defaultEditor.setAutocompleteMaxVisible(autocompleteMaxVisible);
    if (this.editor !== this.defaultEditor) {
      this.editor.setPaddingX?.(editorPaddingX);
      this.editor.setAutocompleteMaxVisible?.(autocompleteMaxVisible);
    }
  }
  async rebindCurrentSession(options = {}) {
    const session = this.session;
    this.unsubscribe?.();
    this.unsubscribe = void 0;
    this.applyRuntimeSettings();
    if (options.renderBeforeBind) {
      this.renderCurrentSessionState();
      this.subscribeToAgent();
    }
    await this.bindCurrentSessionExtensions();
    if (this.session !== session) {
      return;
    }
    if (!options.renderBeforeBind) {
      this.subscribeToAgent();
    }
    await this.updateAvailableProviderCount();
    this.updateEditorBorderColor();
    this.updateTerminalTitle();
  }
  async handleFatalRuntimeError(prefix, error) {
    const message = error instanceof Error ? error.message : String(error);
    this.showError(`${prefix}: ${message}`);
    stopThemeWatcher();
    this.stop("transcript");
    process.exit(1);
  }
  renderCurrentSessionState() {
    this.loadedResourcesContainer.clear();
    this.chatContainer.clear();
    this.pendingMessagesContainer.clear();
    this.compactionQueuedMessages = [];
    this.streamingComponent = void 0;
    this.streamingMessage = void 0;
    this.pendingTools.clear();
    this.renderInitialMessages();
  }
  /**
   * Get a registered tool definition by name (for custom rendering).
   */
  getRegisteredToolDefinition(toolName) {
    return this.session.getToolDefinition(toolName);
  }
  getMarkdownTransformers() {
    return [this.mermaidMarkdownTransformer, ...this.session.extensionRunner.getMarkdownTransformers()];
  }
  /**
   * Set up keyboard shortcuts registered by extensions.
   */
  setupExtensionShortcuts(extensionRunner) {
    const shortcuts = extensionRunner.getShortcuts(this.keybindings.getEffectiveConfig());
    if (shortcuts.size === 0) return;
    const createContext = () => ({
      ui: this.createExtensionUIContext(),
      mode: "tui",
      hasUI: true,
      cwd: this.sessionManager.getCwd(),
      sessionManager: this.sessionManager,
      modelRegistry: extensionRunner.getModelRegistry(),
      model: this.session.model,
      scopedModels: this.session.scopedModels,
      thinkingLevel: this.session.thinkingLevel,
      isIdle: () => this.session.isIdle,
      isProjectTrusted: () => this.settingsManager.isProjectTrusted(),
      signal: this.session.agent.signal,
      abort: () => {
        this.restoreQueuedMessagesToEditor({ abort: true });
      },
      hasPendingMessages: () => this.session.pendingMessageCount > 0,
      shutdown: () => {
        this.shutdownRequested = true;
      },
      getContextUsage: () => this.session.getContextUsage(),
      compact: (options) => {
        void (async () => {
          try {
            const result = await this.session.compact(options?.customInstructions);
            options?.onComplete?.(result);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            options?.onError?.(err);
          }
        })();
      },
      getSystemPrompt: () => this.session.systemPrompt
    });
    this.defaultEditor.onExtensionShortcut = (data) => {
      for (const [shortcutStr, shortcut] of shortcuts) {
        if (matchesKey(data, shortcutStr)) {
          Promise.resolve(shortcut.handler(createContext())).catch((err) => {
            this.showError(`Shortcut handler error: ${err instanceof Error ? err.message : String(err)}`);
          });
          return true;
        }
      }
      return false;
    };
  }
  /**
   * Set extension status text in the footer.
   */
  setExtensionStatus(key, text) {
    this.footerDataProvider.setExtensionStatus(key, text);
    this.ui.requestRender();
  }
  showStatusIndicator(indicator) {
    this.activeStatusIndicator?.dispose();
    this.activeStatusIndicator = indicator;
    this.statusContainer.clear();
    this.statusContainer.addChild(indicator);
  }
  clearStatusIndicator(kind) {
    if (kind && this.activeStatusIndicator?.kind !== kind) {
      return;
    }
    const hadActiveStatusIndicator = this.activeStatusIndicator !== void 0;
    this.activeStatusIndicator?.dispose();
    this.activeStatusIndicator = void 0;
    this.statusContainer.clear();
    if (hadActiveStatusIndicator && this.options.tuiMode === "regular" && this.ui.getClearOnShrink()) {
      this.statusContainer.addChild(this.idleStatus);
    }
  }
  setWorkingVisible(visible) {
    this.workingVisible = visible;
    if (!visible) {
      this.clearStatusIndicator("working");
      this.ui.requestRender();
      return;
    }
    if (this.session.isStreaming && this.activeStatusIndicator?.kind !== "working") {
      this.showStatusIndicator(
        new WorkingStatusIndicator(
          this.ui,
          this.workingMessage ?? this.defaultWorkingMessage,
          this.workingIndicatorOptions
        )
      );
    }
    this.ui.requestRender();
  }
  setWorkingIndicator(options) {
    this.workingIndicatorOptions = options;
    if (this.activeStatusIndicator?.kind === "working") {
      this.activeStatusIndicator.setIndicator(options);
    }
    this.ui.requestRender();
  }
  setHiddenThinkingLabel(label) {
    this.hiddenThinkingLabel = label ?? this.defaultHiddenThinkingLabel;
    for (const child of this.chatContainer.children) {
      if (child instanceof AssistantMessageComponent) {
        child.setHiddenThinkingLabel(this.hiddenThinkingLabel);
      }
    }
    if (this.streamingComponent) {
      this.streamingComponent.setHiddenThinkingLabel(this.hiddenThinkingLabel);
    }
    this.ui.requestRender();
  }
  /**
   * Set an extension widget (string array or custom component).
   */
  setExtensionWidget(key, content, options) {
    const placement = options?.placement ?? "aboveEditor";
    const removeExisting = (map) => {
      const existing = map.get(key);
      if (existing?.dispose) existing.dispose();
      map.delete(key);
    };
    removeExisting(this.extensionWidgetsAbove);
    removeExisting(this.extensionWidgetsBelow);
    if (content === void 0) {
      this.renderWidgets();
      return;
    }
    let component;
    if (Array.isArray(content)) {
      const container = new Container();
      for (const line of content.slice(0, InteractiveMode.MAX_WIDGET_LINES)) {
        container.addChild(new Text(line, 1, 0));
      }
      if (content.length > InteractiveMode.MAX_WIDGET_LINES) {
        container.addChild(new Text(theme.fg("muted", "... (widget truncated)"), 1, 0));
      }
      component = container;
    } else {
      component = content(this.ui, theme);
    }
    const targetMap = placement === "belowEditor" ? this.extensionWidgetsBelow : this.extensionWidgetsAbove;
    targetMap.set(key, component);
    this.renderWidgets();
  }
  clearExtensionWidgets() {
    for (const widget of this.extensionWidgetsAbove.values()) {
      widget.dispose?.();
    }
    for (const widget of this.extensionWidgetsBelow.values()) {
      widget.dispose?.();
    }
    this.extensionWidgetsAbove.clear();
    this.extensionWidgetsBelow.clear();
    this.renderWidgets();
  }
  resetExtensionUI() {
    if (this.extensionSelector) {
      this.hideExtensionSelector();
    }
    if (this.extensionInput) {
      this.hideExtensionInput();
    }
    if (this.extensionEditor) {
      this.hideExtensionEditor();
    }
    this.ui.hideOverlay();
    this.clearExtensionTerminalInputListeners();
    this.setExtensionFooter(void 0);
    this.setExtensionHeader(void 0);
    this.clearExtensionWidgets();
    this.footerDataProvider.clearExtensionStatuses();
    this.footer.invalidate();
    this.autocompleteProviderWrappers = [];
    this.setCustomEditorComponent(void 0);
    this.setupAutocompleteProvider();
    this.defaultEditor.onExtensionShortcut = void 0;
    this.updateTerminalTitle();
    this.workingMessage = void 0;
    this.workingVisible = true;
    this.setWorkingIndicator();
    if (this.activeStatusIndicator?.kind === "working") {
      this.activeStatusIndicator.setMessage(
        `${this.defaultWorkingMessage} (${keyText("app.interrupt")} to interrupt)`
      );
    }
    this.setHiddenThinkingLabel();
  }
  // Maximum total widget lines to prevent viewport overflow
  static MAX_WIDGET_LINES = 10;
  /**
   * Render all extension widgets to the widget container.
   */
  renderWidgets() {
    if (!this.widgetContainerAbove || !this.widgetContainerBelow) return;
    this.renderWidgetContainer(this.widgetContainerAbove, this.extensionWidgetsAbove, true, true);
    this.renderWidgetContainer(this.widgetContainerBelow, this.extensionWidgetsBelow, false, false);
    this.ui.requestRender();
  }
  renderWidgetContainer(container, widgets, spacerWhenEmpty, leadingSpacer) {
    container.clear();
    if (widgets.size === 0) {
      if (spacerWhenEmpty) {
        container.addChild(new Spacer(1));
      }
      return;
    }
    if (leadingSpacer) {
      container.addChild(new Spacer(1));
    }
    for (const component of widgets.values()) {
      container.addChild(component);
    }
  }
  /**
   * Set a custom footer component, or restore the built-in footer.
   */
  setExtensionFooter(factory) {
    if (this.customFooter?.dispose) {
      this.customFooter.dispose();
    }
    this.footerContainer.clear();
    if (factory) {
      this.customFooter = factory(this.ui, theme, this.footerDataProvider);
      this.footerContainer.addChild(this.customFooter);
    } else {
      this.customFooter = void 0;
      this.footerContainer.addChild(this.footer);
    }
    this.ui.requestRender();
  }
  /**
   * Set a custom header component, or restore the built-in header.
   */
  setExtensionHeader(factory) {
    if (!this.builtInHeader) {
      return;
    }
    if (this.customHeader?.dispose) {
      this.customHeader.dispose();
    }
    const currentHeader = this.customHeader || this.builtInHeader;
    const index = this.headerContainer.children.indexOf(currentHeader);
    if (factory) {
      this.customHeader = factory(this.ui, theme);
      if (isExpandable(this.customHeader)) {
        this.customHeader.setExpanded(this.toolOutputExpanded);
      }
      if (index !== -1) {
        this.headerContainer.children[index] = this.customHeader;
      } else {
        this.headerContainer.children.unshift(this.customHeader);
      }
    } else {
      this.customHeader = void 0;
      if (isExpandable(this.builtInHeader)) {
        this.builtInHeader.setExpanded(this.toolOutputExpanded);
      }
      if (index !== -1) {
        this.headerContainer.children[index] = this.builtInHeader;
      }
    }
    this.ui.requestRender();
  }
  addExtensionTerminalInputListener(handler) {
    const subscription = { handler, unsubscribe: this.ui.addInputListener(handler) };
    this.extensionTerminalInputSubscriptions.add(subscription);
    return () => {
      subscription.unsubscribe();
      this.extensionTerminalInputSubscriptions.delete(subscription);
    };
  }
  rebindExtensionTerminalInputListeners() {
    for (const subscription of this.extensionTerminalInputSubscriptions) {
      subscription.unsubscribe();
      subscription.unsubscribe = this.ui.addInputListener(subscription.handler);
    }
  }
  clearExtensionTerminalInputListeners() {
    for (const subscription of this.extensionTerminalInputSubscriptions) subscription.unsubscribe();
    this.extensionTerminalInputSubscriptions.clear();
  }
  /**
   * Create the ExtensionUIContext for extensions.
   */
  createProjectTrustContext(cwd) {
    const ui = this.createExtensionUIContext();
    return {
      cwd,
      mode: "tui",
      hasUI: true,
      ui: {
        select: ui.select,
        confirm: ui.confirm,
        input: ui.input,
        notify: ui.notify
      }
    };
  }
  createExtensionUIContext() {
    return {
      select: (title, options, opts) => this.showExtensionSelector(title, options, opts),
      confirm: (title, message, opts) => this.showExtensionConfirm(title, message, opts),
      input: (title, placeholder, opts) => this.showExtensionInput(title, placeholder, opts),
      notify: (message, type) => this.showExtensionNotify(message, type),
      onTerminalInput: (handler) => this.addExtensionTerminalInputListener(handler),
      setStatus: (key, text) => this.setExtensionStatus(key, text),
      setWorkingMessage: (message) => {
        this.workingMessage = message;
        if (this.activeStatusIndicator?.kind === "working") {
          this.activeStatusIndicator.setMessage(message ?? this.defaultWorkingMessage);
        }
      },
      setWorkingVisible: (visible) => this.setWorkingVisible(visible),
      setWorkingIndicator: (options) => this.setWorkingIndicator(options),
      setHiddenThinkingLabel: (label) => this.setHiddenThinkingLabel(label),
      setWidget: (key, content, options) => this.setExtensionWidget(key, content, options),
      setFooter: (factory) => this.setExtensionFooter(factory),
      setHeader: (factory) => this.setExtensionHeader(factory),
      setTitle: (title) => this.ui.terminal.setTitle(title),
      custom: (factory, options) => this.showExtensionCustom(factory, options),
      pasteToEditor: (text) => this.editor.handleInput(`\x1B[200~${text}\x1B[201~`),
      setEditorText: (text) => this.editor.setText(text),
      getEditorText: () => this.editor.getExpandedText?.() ?? this.editor.getText(),
      editor: (title, prefill) => this.showExtensionEditor(title, prefill),
      addAutocompleteProvider: (factory) => {
        this.autocompleteProviderWrappers.push(factory);
        this.setupAutocompleteProvider();
      },
      setEditorComponent: (factory) => this.setCustomEditorComponent(factory),
      getEditorComponent: () => this.editorComponentFactory,
      get theme() {
        return theme;
      },
      getAllThemes: () => getAvailableThemesWithPaths(),
      getTheme: (name) => getThemeByName(name),
      setTheme: (themeOrName) => {
        if (themeOrName instanceof Theme) {
          return this.themeController.setThemeInstance(themeOrName);
        }
        const result = this.themeController.setThemeName(themeOrName);
        if (result.success) {
          if (this.settingsManager.getTheme() !== themeOrName) {
            this.settingsManager.setTheme(themeOrName);
          }
        }
        return result;
      },
      getToolsExpanded: () => this.toolOutputExpanded,
      setToolsExpanded: (expanded) => this.setToolsExpanded(expanded)
    };
  }
  /**
   * Show a selector for extensions.
   */
  showExtensionSelector(title, options, opts) {
    return new Promise((resolve) => {
      if (opts?.signal?.aborted) {
        resolve(void 0);
        return;
      }
      const onAbort = () => {
        this.hideExtensionSelector();
        resolve(void 0);
      };
      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      this.extensionSelector = new ExtensionSelectorComponent(
        title,
        options,
        (option) => {
          opts?.signal?.removeEventListener("abort", onAbort);
          this.hideExtensionSelector();
          resolve(option);
        },
        () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          this.hideExtensionSelector();
          resolve(void 0);
        },
        { tui: this.ui, timeout: opts?.timeout, onToggleToolsExpanded: () => this.toggleToolOutputExpansion() }
      );
      this.disposeActiveSelector();
      this.editorContainer.clear();
      this.editorContainer.addChild(this.extensionSelector);
      this.ui.setFocus(this.extensionSelector);
      this.ui.requestRender();
    });
  }
  /**
   * Hide the extension selector.
   */
  hideExtensionSelector() {
    this.extensionSelector?.dispose();
    this.editorContainer.clear();
    this.editorContainer.addChild(this.editor);
    this.extensionSelector = void 0;
    this.ui.setFocus(this.editor);
    this.ui.requestRender();
  }
  /**
   * Show a confirmation dialog for extensions.
   */
  async showExtensionConfirm(title, message, opts) {
    const result = await this.showExtensionSelector(`${title}
${message}`, ["Yes", "No"], opts);
    return result === "Yes";
  }
  async promptForMissingSessionCwd(error) {
    const confirmed = await this.showExtensionConfirm(
      "Session cwd not found",
      formatMissingSessionCwdPrompt(error.issue)
    );
    return confirmed ? error.issue.fallbackCwd : void 0;
  }
  /**
   * Show a text input for extensions.
   */
  showExtensionInput(title, placeholder, opts) {
    return new Promise((resolve) => {
      if (opts?.signal?.aborted) {
        resolve(void 0);
        return;
      }
      const onAbort = () => {
        this.hideExtensionInput();
        resolve(void 0);
      };
      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      this.extensionInput = new ExtensionInputComponent(
        title,
        placeholder,
        (value) => {
          opts?.signal?.removeEventListener("abort", onAbort);
          this.hideExtensionInput();
          resolve(value);
        },
        () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          this.hideExtensionInput();
          resolve(void 0);
        },
        { tui: this.ui, timeout: opts?.timeout }
      );
      this.disposeActiveSelector();
      this.editorContainer.clear();
      this.editorContainer.addChild(this.extensionInput);
      this.ui.setFocus(this.extensionInput);
      this.ui.requestRender();
    });
  }
  /**
   * Hide the extension input.
   */
  hideExtensionInput() {
    this.extensionInput?.dispose();
    this.editorContainer.clear();
    this.editorContainer.addChild(this.editor);
    this.extensionInput = void 0;
    this.ui.setFocus(this.editor);
    this.ui.requestRender();
  }
  /**
   * Show a multi-line editor for extensions (with Ctrl+G support).
   */
  showExtensionEditor(title, prefill) {
    return new Promise((resolve) => {
      this.extensionEditor = new ExtensionEditorComponent(
        this.ui,
        this.keybindings,
        title,
        prefill,
        (value) => {
          this.hideExtensionEditor();
          resolve(value);
        },
        () => {
          this.hideExtensionEditor();
          resolve(void 0);
        },
        void 0,
        this.settingsManager.getExternalEditorCommand()
      );
      this.disposeActiveSelector();
      this.editorContainer.clear();
      this.editorContainer.addChild(this.extensionEditor);
      this.ui.setFocus(this.extensionEditor);
      this.ui.requestRender();
    });
  }
  /**
   * Hide the extension editor.
   */
  hideExtensionEditor() {
    this.editorContainer.clear();
    this.editorContainer.addChild(this.editor);
    this.extensionEditor = void 0;
    this.ui.setFocus(this.editor);
    this.ui.requestRender();
  }
  /**
   * Set a custom editor component from an extension.
   * Pass undefined to restore the default editor.
   */
  setCustomEditorComponent(factory) {
    this.editorComponentFactory = factory;
    const currentText = this.editor.getText();
    this.disposeActiveSelector();
    this.editorContainer.clear();
    if (factory) {
      const newEditor = factory(this.ui, getEditorTheme(), this.keybindings);
      newEditor.onSubmit = this.defaultEditor.onSubmit;
      newEditor.onChange = this.defaultEditor.onChange;
      newEditor.setText(currentText);
      if (newEditor.borderColor !== void 0) {
        newEditor.borderColor = this.defaultEditor.borderColor;
      }
      if (newEditor.setPaddingX !== void 0) {
        newEditor.setPaddingX(this.defaultEditor.getPaddingX());
      }
      if (newEditor.setAutocompleteMaxVisible !== void 0) {
        newEditor.setAutocompleteMaxVisible(this.defaultEditor.getAutocompleteMaxVisible());
      }
      if (newEditor.setAutocompleteProvider && this.autocompleteProvider) {
        newEditor.setAutocompleteProvider(this.autocompleteProvider);
      }
      const customEditor = newEditor;
      if ("actionHandlers" in customEditor && customEditor.actionHandlers instanceof Map) {
        if (!customEditor.onEscape) {
          customEditor.onEscape = () => this.defaultEditor.onEscape?.();
        }
        if (!customEditor.onCtrlD) {
          customEditor.onCtrlD = () => this.defaultEditor.onCtrlD?.();
        }
        if (!customEditor.onPasteImage) {
          customEditor.onPasteImage = () => this.defaultEditor.onPasteImage?.();
        }
        if (!customEditor.onExtensionShortcut) {
          customEditor.onExtensionShortcut = (data) => this.defaultEditor.onExtensionShortcut?.(data);
        }
        for (const [action, handler] of this.defaultEditor.actionHandlers) {
          customEditor.actionHandlers.set(action, handler);
        }
      }
      this.editor = newEditor;
    } else {
      this.defaultEditor.setText(currentText);
      this.editor = this.defaultEditor;
    }
    this.editorContainer.addChild(this.editor);
    this.ui.setFocus(this.editor);
    this.ui.requestRender();
  }
  /**
   * Show a notification for extensions.
   */
  showExtensionNotify(message, type) {
    if (type === "error") {
      this.showError(message);
    } else if (type === "warning") {
      this.showWarning(message);
    } else {
      this.showStatus(message);
    }
  }
  /** Show a custom component with keyboard focus. Overlay mode renders on top of existing content. */
  async showExtensionCustom(factory, options) {
    const savedText = this.editor.getText();
    const isOverlay = options?.overlay ?? false;
    const restoreEditor = () => {
      this.editorContainer.clear();
      this.editorContainer.addChild(this.editor);
      this.editor.setText(savedText);
      this.ui.setFocus(this.editor);
      this.ui.requestRender();
    };
    return new Promise((resolve, reject) => {
      let component;
      let closed = false;
      const close = (result) => {
        if (closed) return;
        closed = true;
        if (isOverlay) this.ui.hideOverlay();
        else restoreEditor();
        resolve(result);
        try {
          component?.dispose?.();
        } catch {
        }
      };
      Promise.resolve(factory(this.ui, theme, this.keybindings, close)).then((c) => {
        if (closed) return;
        component = c;
        if (isOverlay) {
          const resolveOptions = () => {
            if (options?.overlayOptions) {
              const opts = typeof options.overlayOptions === "function" ? options.overlayOptions() : options.overlayOptions;
              return opts;
            }
            const w = component.width;
            return w ? { width: w } : void 0;
          };
          const handle = this.ui.showOverlay(component, resolveOptions());
          options?.onHandle?.(handle);
        } else {
          this.disposeActiveSelector();
          this.editorContainer.clear();
          this.editorContainer.addChild(component);
          this.ui.setFocus(component);
          this.ui.requestRender();
        }
      }).catch((err) => {
        if (closed) return;
        if (!isOverlay) restoreEditor();
        reject(err);
      });
    });
  }
  /**
   * Show an extension error in the UI.
   */
  showExtensionError(extensionPath, error, stack) {
    const errorMsg = `Extension "${extensionPath}" error: ${error}`;
    const errorText = new Text(theme.fg("error", errorMsg), 1, 0);
    this.chatContainer.addChild(errorText);
    if (stack) {
      const stackLines = stack.split("\n").slice(1).map((line) => theme.fg("dim", `  ${line.trim()}`)).join("\n");
      if (stackLines) {
        this.chatContainer.addChild(new Text(stackLines, 1, 0));
      }
    }
    this.ui.requestRender();
  }
  // =========================================================================
  // Key Handlers
  // =========================================================================
  setupKeyHandlers() {
    this.defaultEditor.onEscape = () => {
      if (this.session.isStreaming) {
        this.restoreQueuedMessagesToEditor({ abort: true });
      } else if (this.session.isBashRunning) {
        this.session.abortBash();
      } else if (this.isBashMode) {
        this.editor.setText("");
        this.isBashMode = false;
        this.updateEditorBorderColor();
      } else if (!this.editor.getText().trim()) {
        const action = this.settingsManager.getDoubleEscapeAction();
        if (action !== "none") {
          const now = Date.now();
          if (now - this.lastEscapeTime < 500) {
            if (action === "tree") {
              this.showTreeSelector();
            } else {
              this.showUserMessageSelector();
            }
            this.lastEscapeTime = 0;
          } else {
            this.lastEscapeTime = now;
          }
        }
      }
    };
    this.defaultEditor.onAction("app.clear", () => this.handleCtrlC());
    this.defaultEditor.onCtrlD = () => this.handleCtrlD();
    this.defaultEditor.onAction("app.suspend", () => this.handleCtrlZ());
    this.defaultEditor.onAction("app.thinking.cycle", () => this.cycleThinkingLevel());
    this.defaultEditor.onAction("app.model.cycleForward", () => this.cycleModel("forward"));
    this.defaultEditor.onAction("app.model.cycleBackward", () => this.cycleModel("backward"));
    this.ui.onDebug = () => this.handleDebugCommand();
    this.defaultEditor.onAction("app.model.select", () => this.showModelSelector());
    this.defaultEditor.onAction("app.tools.expand", () => this.toggleToolOutputExpansion());
    this.defaultEditor.onAction("app.thinking.toggle", () => this.toggleThinkingBlockVisibility());
    this.defaultEditor.onAction("app.editor.external", () => void this.handleOpenExternalEditor());
    this.defaultEditor.onAction("app.message.copy", () => void this.handleCopyCommand({ flashConfirmation: true }));
    this.defaultEditor.onAction("app.message.followUp", () => this.handleFollowUp());
    this.defaultEditor.onAction("app.message.dequeue", () => this.handleDequeue());
    this.defaultEditor.onAction("app.session.new", () => this.handleClearCommand());
    this.defaultEditor.onAction("app.session.tree", () => this.showTreeSelector());
    this.defaultEditor.onAction("app.session.fork", () => this.showUserMessageSelector());
    this.defaultEditor.onAction("app.session.resume", () => this.showSessionSelector());
    this.defaultEditor.onChange = (text) => {
      const wasBashMode = this.isBashMode;
      this.isBashMode = text.trimStart().startsWith("!");
      if (wasBashMode !== this.isBashMode) {
        this.updateEditorBorderColor();
      }
    };
    this.defaultEditor.onPasteImage = () => {
      void this.handleClipboardPaste();
    };
  }
  async handleRightClickPaste() {
    const target = this.renderer.getFocusedComponent();
    const handleInput = target?.handleInput;
    if (!target || !handleInput) return;
    try {
      const text = await readClipboardText();
      if (!text || this.renderer.getFocusedComponent() !== target) return;
      handleInput.call(target, `\x1B[200~${text}\x1B[201~`);
      this.ui.requestRender();
    } catch {
    }
  }
  async handleClipboardPaste() {
    try {
      const image = await readClipboardImage();
      if (image) {
        const tmpDir = os.tmpdir();
        const ext = extensionForImageMimeType(image.mimeType) ?? "png";
        const fileName = `pi-clipboard-${crypto.randomUUID()}.${ext}`;
        const filePath = path.join(tmpDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(image.bytes));
        this.editor.insertTextAtCursor?.(filePath);
        this.ui.requestRender();
        return;
      }
      const text = await readClipboardText();
      if (text) {
        this.editor.insertTextAtCursor?.(text);
        this.ui.requestRender();
      }
    } catch {
    }
  }
  handleStartupSubmit(text) {
    this.editor.setText(text);
    this.showStatus("Startup is still in progress");
  }
  setupEditorSubmitHandler() {
    this.defaultEditor.onSubmit = async (text) => {
      text = text.trim();
      if (!text) return;
      if (text === "/settings") {
        this.showSettingsSelector();
        this.editor.setText("");
        return;
      }
      if (text === "/scoped-models") {
        this.editor.setText("");
        await this.showModelsSelector();
        return;
      }
      if (text === "/model" || text.startsWith("/model ")) {
        const searchTerm = text.startsWith("/model ") ? text.slice(7).trim() : void 0;
        this.editor.setText("");
        await this.handleModelCommand(searchTerm);
        return;
      }
      if (text === "/thinking" || text.startsWith("/thinking ")) {
        const searchTerm = text.startsWith("/thinking ") ? text.slice(10).trim() : void 0;
        this.editor.setText("");
        this.handleThinkingCommand(searchTerm);
        return;
      }
      if (text === "/export" || text.startsWith("/export ")) {
        await this.handleExportCommand(text);
        this.editor.setText("");
        return;
      }
      if (text === "/import" || text.startsWith("/import ")) {
        await this.handleImportCommand(text);
        this.editor.setText("");
        return;
      }
      if (text === "/share") {
        await this.handleShareCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/copy") {
        await this.handleCopyCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/name" || text.startsWith("/name ")) {
        this.handleNameCommand(text);
        this.editor.setText("");
        return;
      }
      if (text === "/session") {
        this.handleSessionCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/changelog") {
        this.handleChangelogCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/hotkeys") {
        this.handleHotkeysCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/fork") {
        this.showUserMessageSelector();
        this.editor.setText("");
        return;
      }
      if (text === "/clone") {
        this.editor.setText("");
        await this.handleCloneCommand();
        return;
      }
      if (text === "/tree") {
        this.showTreeSelector();
        this.editor.setText("");
        return;
      }
      if (text === "/trust") {
        this.showTrustSelector();
        this.editor.setText("");
        return;
      }
      if (text === "/login" || text.startsWith("/login ")) {
        const providerRef = text.startsWith("/login ") ? text.slice(7).trim() : void 0;
        this.editor.setText("");
        await this.handleLoginCommand(providerRef);
        return;
      }
      if (text === "/logout") {
        this.showOAuthSelector("logout");
        this.editor.setText("");
        return;
      }
      if (text === "/new") {
        this.editor.setText("");
        await this.handleClearCommand();
        return;
      }
      if (text === "/compact" || text.startsWith("/compact ")) {
        const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : void 0;
        this.editor.setText("");
        await this.handleCompactCommand(customInstructions);
        return;
      }
      if (text === "/reload") {
        this.editor.setText("");
        await this.handleReloadCommand();
        return;
      }
      if (text === "/debug") {
        this.handleDebugCommand();
        this.editor.setText("");
        return;
      }
      if (text === "/arminsayshi") {
        this.handleArminSaysHi();
        this.editor.setText("");
        return;
      }
      if (text === "/dementedelves") {
        this.handleDementedDelves();
        this.editor.setText("");
        return;
      }
      if (text === "/resume") {
        this.showSessionSelector();
        this.editor.setText("");
        return;
      }
      if (text === "/quit") {
        this.editor.setText("");
        await this.shutdown();
        return;
      }
      if (text.startsWith("!")) {
        const isExcluded = text.startsWith("!!");
        const command = isExcluded ? text.slice(2).trim() : text.slice(1).trim();
        if (command) {
          if (this.session.isBashRunning) {
            this.showWarning("A bash command is already running. Press Esc to cancel it first.");
            this.editor.setText(text);
            return;
          }
          this.editor.addToHistory?.(text);
          await this.handleBashCommand(command, isExcluded);
          this.isBashMode = false;
          this.updateEditorBorderColor();
          return;
        }
      }
      if (this.session.isCompacting) {
        if (this.isExtensionCommand(text)) {
          this.editor.addToHistory?.(text);
          this.editor.setText("");
          await this.session.prompt(text);
        } else {
          this.queueCompactionMessage(text, "steer");
        }
        return;
      }
      if (this.session.isStreaming) {
        this.editor.addToHistory?.(text);
        this.editor.setText("");
        await this.session.prompt(text, { streamingBehavior: "steer" });
        this.updatePendingMessagesDisplay();
        this.ui.requestRender();
        return;
      }
      this.flushPendingBashComponents();
      if (this.onInputCallback) {
        this.onInputCallback(text);
      } else {
        this.pendingUserInputs.push(text);
      }
      this.editor.addToHistory?.(text);
    };
  }
  subscribeToAgent() {
    this.unsubscribe = this.session.subscribe(async (event) => {
      await this.handleEvent(event);
    });
  }
  async handleEvent(event) {
    if (!this.isInitialized) {
      await this.init();
    }
    this.footer.invalidate();
    switch (event.type) {
      case "agent_start":
        this.pendingTools.clear();
        if (this.settingsManager.getShowTerminalProgress()) {
          this.ui.terminal.setProgress(true);
        }
        if (this.retryEscapeHandler) {
          this.defaultEditor.onEscape = this.retryEscapeHandler;
          this.retryEscapeHandler = void 0;
        }
        if (this.workingVisible) {
          this.showStatusIndicator(
            new WorkingStatusIndicator(
              this.ui,
              this.workingMessage ?? this.defaultWorkingMessage,
              this.workingIndicatorOptions
            )
          );
        } else {
          this.clearStatusIndicator();
        }
        this.ui.requestRender();
        break;
      case "queue_update":
        this.updatePendingMessagesDisplay();
        this.ui.requestRender();
        break;
      case "entry_appended":
        if (event.entry.type === "custom") {
          this.addCustomEntryToChat(event.entry);
          this.ui.requestRender();
        }
        break;
      case "session_info_changed":
        this.updateTerminalTitle();
        this.footer.invalidate();
        this.ui.requestRender();
        break;
      case "thinking_level_changed":
        this.footer.invalidate();
        this.updateEditorBorderColor();
        break;
      case "message_start":
        if (event.message.role === "custom") {
          this.addMessageToChat(event.message);
          this.ui.requestRender();
        } else if (event.message.role === "user") {
          this.addMessageToChat(event.message);
          this.updatePendingMessagesDisplay();
          this.ui.requestRender();
        } else if (event.message.role === "assistant") {
          this.streamingComponent = new AssistantMessageComponent(
            void 0,
            this.hideThinkingBlock,
            this.getMarkdownThemeWithSettings(),
            this.hiddenThinkingLabel,
            this.outputPad,
            this.getMarkdownTransformers()
          );
          this.streamingMessage = event.message;
          this.chatContainer.addChild(this.streamingComponent);
          this.streamingComponent.updateContent(this.streamingMessage, true);
          this.ui.requestRender();
        }
        break;
      case "message_update":
        if (this.streamingComponent && event.message.role === "assistant") {
          this.streamingMessage = event.message;
          this.streamingComponent.updateContent(this.streamingMessage, true);
          for (const content of this.streamingMessage.content) {
            if (content.type === "toolCall") {
              if (!this.pendingTools.has(content.id)) {
                const component = new ToolExecutionComponent(
                  content.name,
                  content.id,
                  content.arguments,
                  {
                    showImages: this.settingsManager.getShowImages(),
                    imageWidthCells: this.settingsManager.getImageWidthCells()
                  },
                  this.getRegisteredToolDefinition(content.name),
                  this.ui,
                  this.sessionManager.getCwd()
                );
                component.setExpanded(this.toolOutputExpanded);
                this.chatContainer.addChild(component);
                this.pendingTools.set(content.id, component);
              } else {
                const component = this.pendingTools.get(content.id);
                if (component) {
                  component.updateArgs(content.arguments);
                }
              }
            }
          }
          this.ui.requestRender();
        }
        break;
      case "message_end":
        if (event.message.role === "user") break;
        if (this.streamingComponent && event.message.role === "assistant") {
          this.streamingMessage = event.message;
          let errorMessage;
          if (this.streamingMessage.stopReason === "aborted") {
            const retryAttempt = this.session.retryAttempt;
            errorMessage = retryAttempt > 0 ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}` : "Operation aborted";
            this.streamingMessage.errorMessage = errorMessage;
          }
          this.streamingComponent.updateContent(this.streamingMessage, false);
          if (this.streamingMessage.stopReason === "aborted" || this.streamingMessage.stopReason === "error") {
            if (!errorMessage) {
              errorMessage = this.streamingMessage.errorMessage || "Error";
            }
            for (const [, component] of this.pendingTools.entries()) {
              component.updateResult({
                content: [{ type: "text", text: errorMessage }],
                isError: true
              });
            }
            this.pendingTools.clear();
          } else {
            for (const [, component] of this.pendingTools.entries()) {
              component.setArgsComplete();
            }
            this.maybeShowCacheMissNotice(this.streamingMessage);
          }
          this.streamingComponent = void 0;
          this.streamingMessage = void 0;
          this.footer.invalidate();
        }
        this.ui.requestRender();
        break;
      case "bash_execution_update":
        break;
      case "tool_execution_start": {
        let component = this.pendingTools.get(event.toolCallId);
        if (!component) {
          component = new ToolExecutionComponent(
            event.toolName,
            event.toolCallId,
            event.args,
            {
              showImages: this.settingsManager.getShowImages(),
              imageWidthCells: this.settingsManager.getImageWidthCells()
            },
            this.getRegisteredToolDefinition(event.toolName),
            this.ui,
            this.sessionManager.getCwd()
          );
          component.setExpanded(this.toolOutputExpanded);
          this.chatContainer.addChild(component);
          this.pendingTools.set(event.toolCallId, component);
        }
        component.markExecutionStarted();
        this.ui.requestRender();
        break;
      }
      case "tool_execution_update": {
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.updateResult({ ...event.partialResult, isError: false }, true);
          this.ui.requestRender();
        }
        break;
      }
      case "tool_execution_end": {
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.updateResult({ ...event.result, isError: event.isError });
          this.pendingTools.delete(event.toolCallId);
          this.ui.requestRender();
        }
        break;
      }
      case "agent_end":
        if (this.settingsManager.getShowTerminalProgress()) {
          this.ui.terminal.setProgress(false);
        }
        this.clearStatusIndicator("working");
        if (this.streamingComponent) {
          this.chatContainer.removeChild(this.streamingComponent);
          this.streamingComponent = void 0;
          this.streamingMessage = void 0;
        }
        this.pendingTools.clear();
        this.ui.requestRender();
        break;
      case "agent_settled":
        await this.checkShutdownRequested();
        break;
      case "compaction_start": {
        if (this.settingsManager.getShowTerminalProgress()) {
          this.ui.terminal.setProgress(true);
        }
        this.autoCompactionEscapeHandler = this.defaultEditor.onEscape;
        this.defaultEditor.onEscape = () => {
          this.session.abortCompaction();
        };
        this.showStatusIndicator(new CompactionStatusIndicator(this.ui, event.reason));
        this.ui.requestRender();
        break;
      }
      case "compaction_end": {
        if (this.settingsManager.getShowTerminalProgress()) {
          this.ui.terminal.setProgress(false);
        }
        if (this.autoCompactionEscapeHandler) {
          this.defaultEditor.onEscape = this.autoCompactionEscapeHandler;
          this.autoCompactionEscapeHandler = void 0;
        }
        this.clearStatusIndicator("compaction");
        if (event.aborted) {
          if (event.reason === "manual") {
            this.showError("Compaction cancelled");
          } else {
            this.showStatus("Auto-compaction cancelled");
          }
        } else if (event.result) {
          const entries = this.sessionManager.buildContextEntries();
          if (entries[0]?.type !== "compaction") {
            throw new Error("Completed compaction is missing from the session context");
          }
          this.chatContainer.clear();
          this.renderSessionEntries(entries.slice(1));
          this.addMessageToChat(
            createCompactionSummaryMessage(
              event.result.summary,
              event.result.tokensBefore,
              (/* @__PURE__ */ new Date()).toISOString()
            )
          );
          if (event.result.usage) {
            this.addCompactionCostNotice({
              type: "compaction_cost",
              kind: "compaction",
              usage: event.result.usage
            });
          }
          this.footer.invalidate();
        } else if (event.errorMessage) {
          if (event.reason === "manual") {
            this.showError(event.errorMessage);
          } else {
            this.chatContainer.addChild(new Spacer(1));
            this.chatContainer.addChild(new Text(theme.fg("error", event.errorMessage), 1, 0));
          }
        }
        void this.flushCompactionQueue({ willRetry: event.willRetry });
        this.ui.requestRender();
        break;
      }
      case "auto_retry_start": {
        this.retryEscapeHandler = this.defaultEditor.onEscape;
        this.defaultEditor.onEscape = () => {
          this.session.abortRetry();
        };
        this.showStatusIndicator(
          new RetryStatusIndicator(this.ui, event.attempt, event.maxAttempts, event.delayMs)
        );
        this.ui.requestRender();
        break;
      }
      case "auto_retry_end": {
        if (this.retryEscapeHandler) {
          this.defaultEditor.onEscape = this.retryEscapeHandler;
          this.retryEscapeHandler = void 0;
        }
        this.clearStatusIndicator("retry");
        if (!event.success) {
          this.showError(`Retry failed after ${event.attempt} attempts: ${event.finalError || "Unknown error"}`);
        }
        this.ui.requestRender();
        break;
      }
      case "summarization_retry_scheduled": {
        this.showError(event.errorMessage);
        this.showStatusIndicator(
          new RetryStatusIndicator(this.ui, event.attempt, event.maxAttempts, event.delayMs)
        );
        this.ui.requestRender();
        break;
      }
      case "summarization_retry_attempt_start": {
        this.clearStatusIndicator("retry");
        if (event.source === "branchSummary") {
          this.showStatusIndicator(new BranchSummaryStatusIndicator(this.ui));
        } else {
          this.showStatusIndicator(new CompactionStatusIndicator(this.ui, event.reason));
        }
        this.ui.requestRender();
        break;
      }
      case "summarization_retry_finished": {
        this.clearStatusIndicator("retry");
        this.ui.requestRender();
        break;
      }
    }
  }
  /** Extract text content from a user message */
  getUserMessageText(message) {
    if (message.role !== "user") return "";
    const textBlocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content.filter((c) => c.type === "text");
    return textBlocks.map((c) => c.text).join("");
  }
  /** Show a managed-tool status update in the chat. */
  showManagedToolStatus(status) {
    if (!this.managedToolStatusStarted) {
      this.chatContainer.addChild(new Spacer(1));
      this.managedToolStatusStarted = true;
    }
    const message = status.type === "warning" ? `Warning: ${status.message}` : status.message;
    const color = status.type === "warning" ? "warning" : "dim";
    this.chatContainer.addChild(new Text(theme.fg(color, message), 1, 0));
    this.lastStatusSpacer = void 0;
    this.lastStatusText = void 0;
    this.ui.requestRender();
  }
  /**
   * Show a status message in the chat.
   *
   * If multiple status messages are emitted back-to-back (without anything else being added to the chat),
   * we update the previous status line instead of appending new ones to avoid log spam.
   */
  showStatus(message) {
    const children = this.chatContainer.children;
    const last = children.length > 0 ? children[children.length - 1] : void 0;
    const secondLast = children.length > 1 ? children[children.length - 2] : void 0;
    if (last && secondLast && last === this.lastStatusText && secondLast === this.lastStatusSpacer) {
      this.lastStatusText.setText(theme.fg("dim", message));
      this.ui.requestRender();
      return;
    }
    const spacer = new Spacer(1);
    const text = new Text(theme.fg("dim", message), 1, 0);
    this.chatContainer.addChild(spacer);
    this.chatContainer.addChild(text);
    this.lastStatusSpacer = spacer;
    this.lastStatusText = text;
    this.ui.requestRender();
  }
  addCustomEntryToChat(entry) {
    const renderer = this.session.extensionRunner.getEntryRenderer(entry.customType);
    if (!renderer) {
      return;
    }
    const component = new CustomEntryComponent(entry, renderer);
    component.setExpanded(this.toolOutputExpanded);
    if (!component.hasContent()) {
      return;
    }
    if (this.streamingComponent) {
      const streamingIndex = this.chatContainer.children.indexOf(this.streamingComponent);
      if (streamingIndex >= 0) {
        this.chatContainer.children.splice(streamingIndex, 0, component);
        return;
      }
    }
    this.chatContainer.addChild(component);
  }
  addMessageToChat(message, options) {
    switch (message.role) {
      case "bashExecution": {
        const component = new BashExecutionComponent(message.command, this.ui, message.excludeFromContext);
        if (message.output) {
          component.appendOutput(message.output);
        }
        component.setComplete(
          message.exitCode,
          message.cancelled,
          message.truncated ? { truncated: true } : void 0,
          message.fullOutputPath
        );
        this.chatContainer.addChild(component);
        break;
      }
      case "custom": {
        if (message.display) {
          const renderer = this.session.extensionRunner.getMessageRenderer(message.customType);
          const component = new CustomMessageComponent(
            message,
            renderer,
            this.getMarkdownThemeWithSettings(),
            this.outputPad
          );
          component.setExpanded(this.toolOutputExpanded);
          this.chatContainer.addChild(component);
        }
        break;
      }
      case "compactionSummary": {
        this.chatContainer.addChild(new Spacer(1));
        const component = new CompactionSummaryMessageComponent(message, this.getMarkdownThemeWithSettings());
        component.setExpanded(this.toolOutputExpanded);
        this.chatContainer.addChild(component);
        break;
      }
      case "branchSummary": {
        this.chatContainer.addChild(new Spacer(1));
        const component = new BranchSummaryMessageComponent(message, this.getMarkdownThemeWithSettings());
        component.setExpanded(this.toolOutputExpanded);
        this.chatContainer.addChild(component);
        break;
      }
      case "user": {
        const textContent = this.getUserMessageText(message);
        if (textContent) {
          if (this.chatContainer.children.length > 0) {
            this.chatContainer.addChild(new Spacer(1));
          }
          const skillBlock = parseSkillBlock(textContent);
          if (skillBlock) {
            const component = new SkillInvocationMessageComponent(
              skillBlock,
              this.getMarkdownThemeWithSettings()
            );
            component.setExpanded(this.toolOutputExpanded);
            this.chatContainer.addChild(component);
            if (skillBlock.userMessage) {
              this.chatContainer.addChild(new Spacer(1));
              const userComponent = new UserMessageComponent(
                skillBlock.userMessage,
                this.getMarkdownThemeWithSettings(),
                this.outputPad,
                this.getMarkdownTransformers()
              );
              this.chatContainer.addChild(userComponent);
            }
          } else {
            const userComponent = new UserMessageComponent(
              textContent,
              this.getMarkdownThemeWithSettings(),
              this.outputPad,
              this.getMarkdownTransformers()
            );
            this.chatContainer.addChild(userComponent);
          }
          if (options?.populateHistory) {
            this.editor.addToHistory?.(textContent);
          }
        }
        break;
      }
      case "assistant": {
        const assistantComponent = new AssistantMessageComponent(
          message,
          this.hideThinkingBlock,
          this.getMarkdownThemeWithSettings(),
          this.hiddenThinkingLabel,
          this.outputPad,
          this.getMarkdownTransformers()
        );
        this.chatContainer.addChild(assistantComponent);
        break;
      }
      case "toolResult": {
        break;
      }
      default: {
        const _exhaustive = message;
      }
    }
  }
  renderSessionItems(items, options = {}) {
    this.pendingTools.clear();
    const renderedPendingTools = /* @__PURE__ */ new Map();
    const cacheMisses = this.settingsManager.getShowCacheMissNotices() ? collectCacheMisses(this.sessionManager.getEntries(), this.session.modelRuntime) : /* @__PURE__ */ new Map();
    if (options.updateFooter) {
      this.footer.invalidate();
      this.updateEditorBorderColor();
    }
    for (const item of items) {
      if (isCustomSessionEntry(item)) {
        this.addCustomEntryToChat(item);
        continue;
      }
      if (isCompactionCostNotice(item)) {
        this.addCompactionCostNotice(item);
        continue;
      }
      const message = item;
      if (message.role === "assistant") {
        this.addMessageToChat(message);
        for (const content of message.content) {
          if (content.type === "toolCall") {
            const component = new ToolExecutionComponent(
              content.name,
              content.id,
              content.arguments,
              {
                showImages: this.settingsManager.getShowImages(),
                imageWidthCells: this.settingsManager.getImageWidthCells()
              },
              this.getRegisteredToolDefinition(content.name),
              this.ui,
              this.sessionManager.getCwd()
            );
            component.setExpanded(this.toolOutputExpanded);
            this.chatContainer.addChild(component);
            if (message.stopReason === "aborted" || message.stopReason === "error") {
              let errorMessage;
              if (message.stopReason === "aborted") {
                const retryAttempt = this.session.retryAttempt;
                errorMessage = retryAttempt > 0 ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}` : "Operation aborted";
              } else {
                errorMessage = message.errorMessage || "Error";
              }
              component.updateResult({ content: [{ type: "text", text: errorMessage }], isError: true });
            } else {
              renderedPendingTools.set(content.id, component);
            }
          }
        }
        if (message.stopReason !== "aborted" && message.stopReason !== "error") {
          const miss = cacheMisses.get(message);
          if (miss) this.addCacheMissNotice(miss);
        }
      } else if (message.role === "toolResult") {
        const component = renderedPendingTools.get(message.toolCallId);
        if (component) {
          component.updateResult(message);
          renderedPendingTools.delete(message.toolCallId);
        }
      } else {
        this.addMessageToChat(message, options);
      }
    }
    for (const [toolCallId, component] of renderedPendingTools) {
      this.pendingTools.set(toolCallId, component);
    }
    this.ui.requestRender();
  }
  /**
   * Render session entries to chat. Used for initial load and rebuild after compaction.
   * @param entries Compaction-aware session entries to render
   * @param options.updateFooter Update footer state
   * @param options.populateHistory Add user messages to editor history
   */
  renderSessionEntries(entries, options = {}) {
    const items = entries.flatMap((entry) => {
      if (entry.type === "custom") {
        return [entry];
      }
      const messages = sessionEntryToContextMessages(entry);
      if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.usage && messages.length > 0) {
        return [...messages, { type: "compaction_cost", kind: entry.type, usage: entry.usage }];
      }
      return messages;
    });
    this.renderSessionItems(items, options);
  }
  /**
   * Render billing usage for a compaction or branch summary. The notice is derived
   * from persisted summary usage and is not stored as a separate session entry.
   */
  addCompactionCostNotice(notice) {
    if (!this.settingsManager.getShowCacheMissNotices()) return;
    const { usage } = notice;
    const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    const cost = usage.cost.total >= 0.01 ? ` (~$${usage.cost.total.toFixed(2)})` : "";
    const label = notice.kind === "compaction" ? "Compaction" : "Branch summary";
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(
      new Text(theme.fg("warning", `${label}: ${formatTokens(tokens)} tokens billed${cost}`), 1, 0)
    );
  }
  /**
   * Show a transcript notice when a completed assistant message paid for a
   * significant cache miss. Only states observable facts: the miss itself,
   * a model switch, or an idle gap past the cache TTL.
   */
  maybeShowCacheMissNotice(message) {
    if (!this.settingsManager.getShowCacheMissNotices()) return;
    const miss = detectCacheMiss(this.sessionManager.getEntries(), message, this.session.modelRuntime);
    if (miss) this.addCacheMissNotice(miss);
  }
  addCacheMissNotice(miss) {
    if (miss.missedTokens < 2e4 && miss.missedCost < 0.1) return;
    const cost = miss.missedCost >= 0.01 ? ` (~$${miss.missedCost.toFixed(2)})` : "";
    const reBilled = `${formatTokens(miss.missedTokens)} tokens re-billed${cost}`;
    let label = "Cache miss";
    if (miss.modelChanged) {
      label = "Cache miss after model switch";
    } else if (miss.idleMs >= CACHE_TTL_MS) {
      label = `Cache miss after ${Math.round(miss.idleMs / 6e4)}m idle`;
    }
    const text = theme.fg("warning", `${label}: ${reBilled}`);
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(text, 1, 0));
  }
  renderInitialMessages() {
    const entries = this.sessionManager.buildContextEntries();
    this.renderSessionEntries(entries, {
      updateFooter: true,
      populateHistory: true
    });
    this.renderProjectTrustWarningIfNeeded();
    const allEntries = this.sessionManager.getEntries();
    const compactionCount = allEntries.filter((e) => e.type === "compaction").length;
    if (compactionCount > 0) {
      const times = compactionCount === 1 ? "1 time" : `${compactionCount} times`;
      this.showStatus(`Session compacted ${times}`);
    }
  }
  renderProjectTrustWarningIfNeeded() {
    if (this.settingsManager.isProjectTrusted() || !hasTrustRequiringProjectResources(this.sessionManager.getCwd())) {
      return;
    }
    if (this.chatContainer.children.length > 0) {
      this.chatContainer.addChild(new Spacer(1));
    }
    this.chatContainer.addChild(
      new Text(
        theme.fg(
          "warning",
          `This project is not trusted. Project ${CONFIG_DIR_NAME} resources and packages are ignored. Use /trust to save a trust decision, then restart pi.`
        ),
        1,
        0
      )
    );
  }
  async getUserInput() {
    const queuedInput = this.pendingUserInputs.shift();
    if (queuedInput !== void 0) {
      return queuedInput;
    }
    return new Promise((resolve) => {
      this.onInputCallback = (text) => {
        this.onInputCallback = void 0;
        resolve(text);
      };
    });
  }
  rebuildChatFromMessages() {
    this.chatContainer.clear();
    this.renderSessionEntries(this.sessionManager.buildContextEntries());
  }
  // =========================================================================
  // Key handlers
  // =========================================================================
  handleCtrlC() {
    const now = Date.now();
    if (now - this.lastSigintTime < 500) {
      void this.shutdown();
    } else {
      this.clearEditor();
      this.lastSigintTime = now;
    }
  }
  handleCtrlD() {
    void this.shutdown();
  }
  /**
   * Gracefully shutdown the agent.
   * Stops the TUI before emitting shutdown events so extension UI cleanup cannot
   * repaint the final frame while the process is exiting.
   */
  isShuttingDown = false;
  async shutdown(options) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    if (options?.fromSignal) {
      await this.runtimeHost.dispose();
      this.themeController.disableAutoSync();
      await this.ui.terminal.drainInput(1e3);
      this.stop();
      process.exit(0);
    }
    this.themeController.disableAutoSync();
    await this.ui.terminal.drainInput(1e3);
    this.stop();
    await this.runtimeHost.dispose();
    const resumeCommand = formatResumeCommand(this.sessionManager);
    if (resumeCommand) {
      process.stdout.write(`${chalk.dim("To resume this session:")} ${resumeCommand}
`);
    }
    process.exit(0);
  }
  emergencyTerminalExit() {
    this.isShuttingDown = true;
    this.unregisterSignalHandlers();
    killTrackedDetachedChildren();
    process.exit(129);
  }
  /**
   * Last-resort handler for uncaught exceptions. The TUI puts stdin into raw
   * mode and hides the cursor; without this handler, an uncaught throw from
   * anywhere (e.g. an extension's async `ChildProcess.on("exit")` callback)
   * tears down the process while leaving the terminal in raw mode with no
   * cursor, requiring `stty sane && reset` to recover.
   *
   * Unlike emergencyTerminalExit, the terminal is still alive here, so we
   * call ui.stop() to restore cooked mode, the cursor, and disable bracketed
   * paste / Kitty / modifyOtherKeys sequences.
   */
  uncaughtCrash(error) {
    if (this.isShuttingDown) {
      process.exit(1);
    }
    this.isShuttingDown = true;
    try {
      this.unregisterSignalHandlers();
    } catch {
    }
    try {
      killTrackedDetachedChildren();
    } catch {
    }
    try {
      this.ui.stop();
    } catch {
    }
    console.error(`${APP_NAME} exiting due to uncaughtException:`);
    console.error(error);
    process.exit(1);
  }
  /**
   * Check if shutdown was requested and perform shutdown if so.
   */
  async checkShutdownRequested() {
    if (!this.shutdownRequested) return;
    await this.shutdown();
  }
  registerSignalHandlers() {
    this.unregisterSignalHandlers();
    const signals = ["SIGTERM"];
    if (process.platform !== "win32") {
      signals.push("SIGHUP");
    }
    for (const signal of signals) {
      const handler = () => {
        killTrackedDetachedChildren();
        void this.shutdown({ fromSignal: true });
      };
      process.prependListener(signal, handler);
      this.signalCleanupHandlers.push(() => process.off(signal, handler));
    }
    const terminalErrorHandler = (error) => {
      if (isDeadTerminalError(error)) {
        this.emergencyTerminalExit();
      }
      throw error;
    };
    process.stdout.on("error", terminalErrorHandler);
    process.stderr.on("error", terminalErrorHandler);
    this.signalCleanupHandlers.push(() => process.stdout.off("error", terminalErrorHandler));
    this.signalCleanupHandlers.push(() => process.stderr.off("error", terminalErrorHandler));
    const uncaughtExceptionHandler = (error) => this.uncaughtCrash(error);
    process.prependListener("uncaughtException", uncaughtExceptionHandler);
    this.signalCleanupHandlers.push(() => process.off("uncaughtException", uncaughtExceptionHandler));
  }
  unregisterSignalHandlers() {
    for (const cleanup of this.signalCleanupHandlers) {
      cleanup();
    }
    this.signalCleanupHandlers = [];
  }
  handleCtrlZ() {
    if (process.platform === "win32") {
      this.showStatus("Suspend to background is not supported on Windows");
      return;
    }
    const suspendKeepAlive = setInterval(() => {
    }, 2 ** 30);
    const ignoreSigint = () => {
    };
    process.on("SIGINT", ignoreSigint);
    process.once("SIGCONT", () => {
      clearInterval(suspendKeepAlive);
      process.removeListener("SIGINT", ignoreSigint);
      this.ui.start();
      this.ui.requestRender(true);
    });
    try {
      this.ui.stop();
      process.kill(0, "SIGTSTP");
    } catch (error) {
      clearInterval(suspendKeepAlive);
      process.removeListener("SIGINT", ignoreSigint);
      throw error;
    }
  }
  async handleFollowUp() {
    const text = (this.editor.getExpandedText?.() ?? this.editor.getText()).trim();
    if (!text) return;
    if (this.session.isCompacting) {
      if (this.isExtensionCommand(text)) {
        this.editor.addToHistory?.(text);
        this.editor.setText("");
        await this.session.prompt(text);
      } else {
        this.queueCompactionMessage(text, "followUp");
      }
      return;
    }
    if (this.session.isStreaming) {
      this.editor.addToHistory?.(text);
      this.editor.setText("");
      await this.session.prompt(text, { streamingBehavior: "followUp" });
      this.updatePendingMessagesDisplay();
      this.ui.requestRender();
    } else if (this.editor.onSubmit) {
      this.editor.setText("");
      this.editor.onSubmit(text);
    }
  }
  handleDequeue() {
    const restored = this.restoreQueuedMessagesToEditor();
    if (restored === 0) {
      this.showStatus("No queued messages to restore");
    } else {
      this.showStatus(`Restored ${restored} queued message${restored > 1 ? "s" : ""} to editor`);
    }
  }
  updateEditorBorderColor() {
    if (this.isBashMode) {
      this.editor.borderColor = theme.getBashModeBorderColor();
    } else {
      const level = this.session.thinkingLevel || "off";
      this.editor.borderColor = theme.getThinkingBorderColor(level);
    }
    this.ui.requestRender();
  }
  cycleThinkingLevel() {
    const newLevel = this.session.cycleThinkingLevel();
    if (newLevel === void 0) {
      this.showStatus("Current model does not support thinking");
    } else {
      this.footer.invalidate();
      this.updateEditorBorderColor();
      this.showStatus(`Thinking level: ${newLevel}`);
    }
  }
  async cycleModel(direction) {
    try {
      const result = await this.session.cycleModel(direction);
      if (result === void 0) {
        const msg = this.session.scopedModels.length > 0 ? "Only one model in scope" : "Only one model available";
        this.showStatus(msg);
      } else {
        this.footer.invalidate();
        this.updateEditorBorderColor();
        const thinkingStr = result.model.reasoning && result.thinkingLevel !== "off" ? ` (thinking: ${result.thinkingLevel})` : "";
        this.showStatus(`Switched to ${result.model.name || result.model.id}${thinkingStr}`);
        void this.maybeWarnAboutAnthropicSubscriptionAuth(result.model);
      }
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }
  toggleToolOutputExpansion() {
    this.setToolsExpanded(!this.toolOutputExpanded);
  }
  setToolsExpanded(expanded) {
    if (expanded === this.toolOutputExpanded) return;
    this.toolOutputExpanded = expanded;
    const activeHeader = this.customHeader ?? this.builtInHeader;
    if (isExpandable(activeHeader)) {
      activeHeader.setExpanded(expanded);
    }
    for (const container of [this.loadedResourcesContainer, this.chatContainer]) {
      for (const child of container.children) {
        if (isExpandable(child)) {
          child.setExpanded(expanded);
        }
      }
    }
    this.showStatus(`Tool output: ${expanded ? "expanded" : "collapsed"}`);
  }
  toggleThinkingBlockVisibility() {
    this.hideThinkingBlock = !this.hideThinkingBlock;
    this.settingsManager.setHideThinkingBlock(this.hideThinkingBlock);
    this.chatContainer.clear();
    this.rebuildChatFromMessages();
    if (this.streamingComponent && this.streamingMessage) {
      this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock);
      this.streamingComponent.updateContent(this.streamingMessage);
      this.chatContainer.addChild(this.streamingComponent);
    }
    this.showStatus(`Thinking blocks: ${this.hideThinkingBlock ? "hidden" : "visible"}`);
  }
  async handleOpenExternalEditor() {
    const editorCmd = this.settingsManager.getExternalEditorCommand();
    const content = this.editor.getExpandedText?.() ?? this.editor.getText();
    this.ui.stop();
    try {
      const result = await editInExternalEditor({
        command: editorCmd,
        content
      });
      if (result.status === "complete") {
        this.editor.setText(result.content);
      }
    } finally {
      this.ui.start();
      this.ui.requestRender(true);
    }
  }
  // =========================================================================
  // UI helpers
  // =========================================================================
  clearEditor() {
    this.editor.setText("");
    this.ui.requestRender();
  }
  showError(errorMessage) {
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(theme.fg("error", `Error: ${errorMessage}`), this.outputPad, 0));
    this.ui.requestRender();
  }
  showWarning(warningMessage) {
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(theme.fg("warning", `Warning: ${warningMessage}`), 1, 0));
    this.ui.requestRender();
  }
  showNewVersionNotification(release) {
    const action = theme.fg("accent", `${APP_NAME} update`);
    const updateInstruction = theme.fg("muted", `New version ${release.version} is available. Run `) + action;
    const changelogUrl = "https://github.com/justelson/zyra/releases";
    const changelogLink = getCapabilities().hyperlinks ? hyperlink(theme.fg("accent", changelogUrl), changelogUrl) : theme.fg("accent", changelogUrl);
    const changelogLine = theme.fg("muted", "Changelog: ") + changelogLink;
    const note = release.note?.trim();
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.chatContainer.addChild(
      new Text(`${theme.bold(theme.fg("warning", "Update Available"))}
${updateInstruction}`, 1, 0)
    );
    if (note) {
      this.chatContainer.addChild(new Spacer(1));
      this.chatContainer.addChild(
        new Markdown(note, 1, 0, this.getMarkdownThemeWithSettings(), {
          color: (text) => theme.fg("muted", text)
        })
      );
      this.chatContainer.addChild(new Spacer(1));
    }
    this.chatContainer.addChild(new Text(changelogLine, 1, 0));
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.ui.requestRender();
  }
  showPackageUpdateNotification(packages) {
    const action = theme.fg("accent", `${APP_NAME} update --extensions`);
    const updateInstruction = theme.fg("muted", "Package updates are available. Run ") + action;
    const packageLines = packages.map((pkg) => `- ${pkg}`).join("\n");
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.chatContainer.addChild(
      new Text(
        `${theme.bold(theme.fg("warning", "Package Updates Available"))}
${updateInstruction}
${theme.fg("muted", "Packages:")}
${packageLines}`,
        1,
        0
      )
    );
    this.chatContainer.addChild(new DynamicBorder((text) => theme.fg("warning", text)));
    this.ui.requestRender();
  }
  /**
   * Get all queued messages (read-only).
   * Combines session queue and compaction queue.
   */
  getAllQueuedMessages() {
    return {
      steering: [
        ...this.session.getSteeringMessages(),
        ...this.compactionQueuedMessages.filter((msg) => msg.mode === "steer").map((msg) => msg.text)
      ],
      followUp: [
        ...this.session.getFollowUpMessages(),
        ...this.compactionQueuedMessages.filter((msg) => msg.mode === "followUp").map((msg) => msg.text)
      ]
    };
  }
  /**
   * Clear all queued messages and return their contents.
   * Clears both session queue and compaction queue.
   */
  clearAllQueues() {
    const { steering, followUp } = this.session.clearQueue();
    const compactionSteering = this.compactionQueuedMessages.filter((msg) => msg.mode === "steer").map((msg) => msg.text);
    const compactionFollowUp = this.compactionQueuedMessages.filter((msg) => msg.mode === "followUp").map((msg) => msg.text);
    this.compactionQueuedMessages = [];
    return {
      steering: [...steering, ...compactionSteering],
      followUp: [...followUp, ...compactionFollowUp]
    };
  }
  updatePendingMessagesDisplay() {
    this.pendingMessagesContainer.clear();
    const { steering: steeringMessages, followUp: followUpMessages } = this.getAllQueuedMessages();
    if (steeringMessages.length > 0 || followUpMessages.length > 0) {
      this.pendingMessagesContainer.addChild(new Spacer(1));
      for (const message of steeringMessages) {
        const text = theme.fg("dim", `Steering: ${message}`);
        this.pendingMessagesContainer.addChild(new TruncatedText(text, 1, 0));
      }
      for (const message of followUpMessages) {
        const text = theme.fg("dim", `Follow-up: ${message}`);
        this.pendingMessagesContainer.addChild(new TruncatedText(text, 1, 0));
      }
      const dequeueHint = this.getAppKeyDisplay("app.message.dequeue");
      const hintText = theme.fg("dim", `\u21B3 ${dequeueHint} to edit all queued messages`);
      this.pendingMessagesContainer.addChild(new TruncatedText(hintText, 1, 0));
    }
  }
  restoreQueuedMessagesToEditor(options) {
    const { steering, followUp } = this.clearAllQueues();
    const allQueued = [...steering, ...followUp];
    if (allQueued.length === 0) {
      this.updatePendingMessagesDisplay();
      if (options?.abort) {
        this.agent.abort();
      }
      return 0;
    }
    const queuedText = allQueued.join("\n\n");
    const currentText = options?.currentText ?? this.editor.getText();
    const combinedText = [queuedText, currentText].filter((t) => t.trim()).join("\n\n");
    this.editor.setText(combinedText);
    this.updatePendingMessagesDisplay();
    if (options?.abort) {
      this.agent.abort();
    }
    return allQueued.length;
  }
  queueCompactionMessage(text, mode) {
    this.compactionQueuedMessages.push({ text, mode });
    this.editor.addToHistory?.(text);
    this.editor.setText("");
    this.updatePendingMessagesDisplay();
    this.showStatus("Queued message for after compaction");
  }
  isExtensionCommand(text) {
    if (!text.startsWith("/")) return false;
    const extensionRunner = this.session.extensionRunner;
    const spaceIndex = text.indexOf(" ");
    const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
    return !!extensionRunner.getCommand(commandName);
  }
  async flushCompactionQueue(options) {
    if (this.compactionQueuedMessages.length === 0) {
      return;
    }
    const queuedMessages = [...this.compactionQueuedMessages];
    this.compactionQueuedMessages = [];
    this.updatePendingMessagesDisplay();
    const restoreQueue = (error) => {
      this.session.clearQueue();
      this.compactionQueuedMessages = queuedMessages;
      this.updatePendingMessagesDisplay();
      this.showError(
        `Failed to send queued message${queuedMessages.length > 1 ? "s" : ""}: ${error instanceof Error ? error.message : String(error)}`
      );
    };
    try {
      if (options?.willRetry) {
        for (const message of queuedMessages) {
          if (this.isExtensionCommand(message.text)) {
            await this.session.prompt(message.text);
          } else if (message.mode === "followUp") {
            await this.session.followUp(message.text);
          } else {
            await this.session.steer(message.text);
          }
        }
        this.updatePendingMessagesDisplay();
        return;
      }
      const firstPromptIndex = queuedMessages.findIndex((message) => !this.isExtensionCommand(message.text));
      if (firstPromptIndex === -1) {
        for (const message of queuedMessages) {
          await this.session.prompt(message.text);
        }
        return;
      }
      const preCommands = queuedMessages.slice(0, firstPromptIndex);
      const firstPrompt = queuedMessages[firstPromptIndex];
      const rest = queuedMessages.slice(firstPromptIndex + 1);
      for (const message of preCommands) {
        await this.session.prompt(message.text);
      }
      const promptPromise = this.session.prompt(firstPrompt.text, { streamingBehavior: firstPrompt.mode }).catch((error) => {
        restoreQueue(error);
      });
      for (const message of rest) {
        if (this.isExtensionCommand(message.text)) {
          await this.session.prompt(message.text);
        } else if (message.mode === "followUp") {
          await this.session.followUp(message.text);
        } else {
          await this.session.steer(message.text);
        }
      }
      this.updatePendingMessagesDisplay();
    } catch (error) {
      restoreQueue(error);
    }
  }
  /** Move pending bash components from pending area to chat */
  flushPendingBashComponents() {
    for (const component of this.pendingBashComponents) {
      this.pendingMessagesContainer.removeChild(component);
      this.chatContainer.addChild(component);
    }
    this.pendingBashComponents = [];
  }
  // =========================================================================
  // Selectors
  // =========================================================================
  disposeActiveSelector() {
    const dispose = this.activeSelectorDispose;
    this.activeSelectorToken = void 0;
    this.activeSelectorDispose = void 0;
    dispose?.();
  }
  /**
   * Shows a selector component in place of the editor.
   * @param create Factory that receives a `done` callback and returns the component and focus target
   */
  showSelector(create) {
    const token = {};
    let dispose;
    const done = () => {
      dispose?.();
      if (this.activeSelectorToken !== token) return;
      this.activeSelectorToken = void 0;
      this.activeSelectorDispose = void 0;
      this.editorContainer.clear();
      this.editorContainer.addChild(this.editor);
      this.ui.setFocus(this.editor);
    };
    const created = create(done);
    dispose = created.dispose;
    this.disposeActiveSelector();
    this.activeSelectorToken = token;
    this.activeSelectorDispose = dispose;
    this.editorContainer.clear();
    this.editorContainer.addChild(created.component);
    this.ui.setFocus(created.focus);
    this.ui.requestRender();
  }
  showSettingsSelector() {
    this.showSelector((done) => {
      let selector;
      const defaultProvider = this.settingsManager.getDefaultProvider();
      const defaultModelId = this.settingsManager.getDefaultModel();
      const defaultModel = defaultProvider && defaultModelId ? `${defaultProvider}/${defaultModelId}` : "not set";
      selector = new SettingsSelectorComponent(
        {
          autoCompact: this.session.autoCompactionEnabled,
          defaultModel,
          currentModel: this.session.model,
          availableDefaultModels: this.session.modelRuntime.getAvailableSnapshot(),
          showImages: this.settingsManager.getShowImages(),
          imageWidthCells: this.settingsManager.getImageWidthCells(),
          autoResizeImages: this.settingsManager.getImageAutoResize(),
          blockImages: this.settingsManager.getBlockImages(),
          enableSkillCommands: this.settingsManager.getEnableSkillCommands(),
          steeringMode: this.session.steeringMode,
          followUpMode: this.session.followUpMode,
          transport: this.settingsManager.getTransport(),
          httpIdleTimeoutMs: this.settingsManager.getHttpIdleTimeoutMs(),
          thinkingLevel: this.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL,
          availableThinkingLevels: [...THINKING_LEVEL_OPTIONS],
          modelThinkingLevels: this.settingsManager.getAllModelThinkingLevels(),
          currentTheme: this.themeController.getThemeSelection() || "dark",
          terminalTheme: this.themeController.getTerminalTheme(),
          availableThemes: getAvailableThemes(),
          hideThinkingBlock: this.hideThinkingBlock,
          mermaidRenderingMode: this.settingsManager.getMermaidRenderingMode(),
          collapseChangelog: this.settingsManager.getCollapseChangelog(),
          enableInstallTelemetry: this.settingsManager.getEnableInstallTelemetry(),
          doubleEscapeAction: this.settingsManager.getDoubleEscapeAction(),
          treeFilterMode: this.settingsManager.getTreeFilterMode(),
          showHardwareCursor: this.settingsManager.getShowHardwareCursor(),
          showCacheMissNotices: this.settingsManager.getShowCacheMissNotices(),
          defaultProjectTrust: this.settingsManager.getDefaultProjectTrust(),
          editorPaddingX: this.settingsManager.getEditorPaddingX(),
          outputPad: this.settingsManager.getOutputPad(),
          autocompleteMaxVisible: this.settingsManager.getAutocompleteMaxVisible(),
          quietStartup: this.settingsManager.getQuietStartup(),
          clearOnShrink: this.settingsManager.getClearOnShrink(),
          showTerminalProgress: this.settingsManager.getShowTerminalProgress(),
          tuiMode: this.ui.mode,
          fullscreenExitOutput: this.settingsManager.getFullscreenExitOutput(),
          fullscreenScrollbar: this.settingsManager.getFullscreenScrollbar(),
          warnings: this.settingsManager.getWarnings()
        },
        {
          onAutoCompactChange: (enabled) => {
            this.session.setAutoCompactionEnabled(enabled);
            this.footer.setAutoCompactEnabled(enabled);
          },
          onShowImagesChange: (enabled) => {
            this.settingsManager.setShowImages(enabled);
            for (const child of this.chatContainer.children) {
              if (child instanceof ToolExecutionComponent) {
                child.setShowImages(enabled);
              }
            }
          },
          onImageWidthCellsChange: (width) => {
            this.settingsManager.setImageWidthCells(width);
            for (const child of this.chatContainer.children) {
              if (child instanceof ToolExecutionComponent) {
                child.setImageWidthCells(width);
              }
            }
          },
          onAutoResizeImagesChange: (enabled) => {
            this.settingsManager.setImageAutoResize(enabled);
          },
          onBlockImagesChange: (blocked) => {
            this.settingsManager.setBlockImages(blocked);
          },
          onEnableSkillCommandsChange: (enabled) => {
            this.settingsManager.setEnableSkillCommands(enabled);
            this.setupAutocompleteProvider();
          },
          onSteeringModeChange: (mode) => {
            this.session.setSteeringMode(mode);
          },
          onFollowUpModeChange: (mode) => {
            this.session.setFollowUpMode(mode);
          },
          onTransportChange: (transport) => {
            this.settingsManager.setTransport(transport);
            this.session.agent.transport = transport;
          },
          onHttpIdleTimeoutMsChange: (timeoutMs) => {
            this.settingsManager.setHttpIdleTimeoutMs(timeoutMs);
            configureHttpDispatcher(timeoutMs);
            this.showStatus(`HTTP idle timeout: ${formatHttpIdleTimeoutMs(timeoutMs)}`);
          },
          onModelThinkingLevelChange: (provider, modelId, level) => {
            this.settingsManager.setModelThinkingLevel(provider, modelId, level);
            const current = this.session.model;
            if (current && current.provider === provider && current.id === modelId) {
              this.session.setThinkingLevel(level);
              this.footer.invalidate();
              this.updateEditorBorderColor();
            }
          },
          onModelThinkingLevelRemove: (provider, modelId) => {
            this.settingsManager.removeModelThinkingLevel(provider, modelId);
            const current = this.session.model;
            if (current && current.provider === provider && current.id === modelId) {
              const globalDefault = this.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
              this.session.setThinkingLevel(globalDefault);
              this.footer.invalidate();
              this.updateEditorBorderColor();
            }
          },
          onThemeChange: (themeSetting) => {
            this.settingsManager.setTheme(themeSetting);
            void this.themeController.setThemeSetting(themeSetting);
          },
          onThemePreview: (themeName) => this.themeController.preview(themeName),
          onHideThinkingBlockChange: (hidden) => {
            this.hideThinkingBlock = hidden;
            this.settingsManager.setHideThinkingBlock(hidden);
            for (const child of this.chatContainer.children) {
              if (child instanceof AssistantMessageComponent) {
                child.setHideThinkingBlock(hidden);
              }
            }
            this.chatContainer.clear();
            this.rebuildChatFromMessages();
          },
          onMermaidRenderingModeChange: (mode) => {
            this.settingsManager.setMermaidRenderingMode(mode);
            this.chatContainer.invalidate();
            this.ui.requestRender();
          },
          onShowCacheMissNoticesChange: (shown) => {
            this.settingsManager.setShowCacheMissNotices(shown);
            this.rebuildChatFromMessages();
          },
          onCollapseChangelogChange: (collapsed) => {
            this.settingsManager.setCollapseChangelog(collapsed);
          },
          onEnableInstallTelemetryChange: (enabled) => {
            this.settingsManager.setEnableInstallTelemetry(enabled);
          },
          onQuietStartupChange: (enabled) => {
            this.settingsManager.setQuietStartup(enabled);
          },
          onDefaultProjectTrustChange: (defaultProjectTrust) => {
            this.settingsManager.setDefaultProjectTrust(defaultProjectTrust);
          },
          onDoubleEscapeActionChange: (action) => {
            this.settingsManager.setDoubleEscapeAction(action);
          },
          onTreeFilterModeChange: (mode) => {
            this.settingsManager.setTreeFilterMode(mode);
          },
          onShowHardwareCursorChange: (enabled) => {
            this.settingsManager.setShowHardwareCursor(enabled);
            this.ui.setShowHardwareCursor(enabled);
          },
          onEditorPaddingXChange: (padding) => {
            this.settingsManager.setEditorPaddingX(padding);
            this.defaultEditor.setPaddingX(padding);
            if (this.editor !== this.defaultEditor && this.editor.setPaddingX !== void 0) {
              this.editor.setPaddingX(padding);
            }
          },
          onOutputPadChange: (padding) => {
            this.settingsManager.setOutputPad(padding);
            this.outputPad = padding;
            if (this.streamingComponent || this.session.isStreaming) {
              for (const child of this.chatContainer.children) {
                if (child instanceof AssistantMessageComponent || child instanceof CustomMessageComponent || child instanceof UserMessageComponent) {
                  child.setOutputPad(padding);
                }
              }
              if (this.streamingComponent) {
                this.streamingComponent.setOutputPad(padding);
              }
              this.ui.requestRender();
              return;
            }
            this.rebuildChatFromMessages();
          },
          onAutocompleteMaxVisibleChange: (maxVisible) => {
            this.settingsManager.setAutocompleteMaxVisible(maxVisible);
            this.defaultEditor.setAutocompleteMaxVisible(maxVisible);
            if (this.editor !== this.defaultEditor && this.editor.setAutocompleteMaxVisible !== void 0) {
              this.editor.setAutocompleteMaxVisible(maxVisible);
            }
          },
          onClearOnShrinkChange: (enabled) => {
            this.settingsManager.setClearOnShrink(enabled);
            this.ui.setClearOnShrink(enabled);
            if (!enabled && !this.activeStatusIndicator) {
              this.statusContainer.clear();
            }
          },
          onShowTerminalProgressChange: (enabled) => {
            this.settingsManager.setShowTerminalProgress(enabled);
          },
          onTuiModeChange: (mode) => {
            if (!this.switchTuiMode(mode)) {
              selector?.getSettingsList().updateValue("tui-mode", this.ui.mode);
              this.showStatus("Close active overlays before changing TUI mode");
              return;
            }
            this.settingsManager.setTuiMode(mode);
            if (!this.activeStatusIndicator) this.statusContainer.clear();
            this.showStatus(`TUI mode: ${mode}`);
          },
          onFullscreenExitOutputChange: (output) => {
            this.settingsManager.setFullscreenExitOutput(output);
          },
          onFullscreenScrollbarChange: (mode) => {
            this.settingsManager.setFullscreenScrollbar(mode);
            this.applyFullscreenScrollbarSetting();
          },
          onWarningsChange: (warnings) => {
            this.settingsManager.setWarnings(warnings);
          },
          onCancel: () => {
            done();
            this.ui.requestRender();
          }
        }
      );
      return { component: selector, focus: selector.getSettingsList() };
    });
  }
  handleThinkingCommand(searchTerm) {
    const availableLevels = this.session.getAvailableThinkingLevels();
    if (!searchTerm) {
      this.showThinkingSelector();
      return;
    }
    const normalized = searchTerm.trim().toLowerCase();
    const level = availableLevels.find((candidate) => candidate.toLowerCase() === normalized);
    if (!level) {
      this.showError(`Unknown thinking level "${searchTerm}". Available levels: ${availableLevels.join(", ")}.`);
      return;
    }
    this.selectThinkingLevel(level, false);
  }
  selectThinkingLevel(level, persist) {
    try {
      this.session.setThinkingLevel(level, { persist });
      this.footer.invalidate();
      this.updateEditorBorderColor();
      this.showStatus(persist ? `Default thinking level: ${level}` : `Thinking level: ${level}`);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }
  showThinkingSelector() {
    this.showSelector((done) => {
      const selectLevel = (level, persist) => {
        this.selectThinkingLevel(level, persist);
        done();
      };
      const selector = new ThinkingSelectorComponent(
        this.session.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
        this.session.getAvailableThinkingLevels(),
        (level) => selectLevel(level, false),
        () => {
          done();
          this.ui.requestRender();
        },
        (level) => selectLevel(level, true),
        this.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL
      );
      return { component: selector, focus: selector };
    });
  }
  async handleModelCommand(searchTerm) {
    if (!searchTerm) {
      this.showModelSelector();
      return;
    }
    const model = await this.findExactModelMatch(searchTerm);
    if (model) {
      try {
        await this.session.setModel(model, { persist: false });
        this.footer.invalidate();
        this.updateEditorBorderColor();
        this.showStatus(`Model: ${model.id}`);
        void this.maybeWarnAboutAnthropicSubscriptionAuth(model);
        this.checkDaxnutsEasterEgg(model);
      } catch (error) {
        this.showError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    this.showModelSelector(searchTerm);
  }
  async findExactModelMatch(searchTerm) {
    const cachedModels = this.session.scopedModels.length > 0 ? this.session.scopedModels.map((scoped) => scoped.model) : [...this.session.modelRuntime.getAvailableSnapshot()];
    const cachedMatch = findExactModelReferenceMatch(searchTerm, cachedModels);
    if (cachedMatch || this.session.scopedModels.length > 0) return cachedMatch;
    this.showStatus("Refreshing model catalogs\u2026");
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15e3);
    try {
      const result = await refreshModelCatalogs(this.session.modelRuntime, controller.signal);
      if (result.aborted && timedOut) {
        this.showWarning("Model refresh timed out; searching cached models.");
      } else if (result.errors.size > 0) {
        this.showWarning(`Could not refresh ${[...result.errors.keys()].join(", ")}; searching cached models.`);
      }
    } catch (error) {
      this.showWarning(
        timedOut ? "Model refresh timed out; searching cached models." : `Could not refresh model catalogs: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeout);
    }
    return findExactModelReferenceMatch(searchTerm, [...this.session.modelRuntime.getAvailableSnapshot()]);
  }
  /** Update the footer's available provider count from the current snapshot without refreshing catalogs. */
  updateAvailableProviderCount() {
    const models = this.session.scopedModels.length > 0 ? this.session.scopedModels.map((scoped) => scoped.model) : this.session.modelRuntime.getAvailableSnapshot();
    const uniqueProviders = new Set(models.map((model) => model.provider));
    this.footerDataProvider.setAvailableProviderCount(uniqueProviders.size);
  }
  async maybeWarnAboutAnthropicSubscriptionAuth(model = this.session.model) {
    if (this.settingsManager.getWarnings().anthropicExtraUsage === false) {
      return;
    }
    if (this.anthropicSubscriptionWarningShown) {
      return;
    }
    if (!model || model.provider !== "anthropic") {
      return;
    }
    try {
      if ((await this.session.modelRuntime.checkAuth("anthropic"))?.type === "oauth") {
        this.anthropicSubscriptionWarningShown = true;
        this.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
        return;
      }
      const apiKey = (await this.session.modelRuntime.getAuth(model.provider))?.auth.apiKey;
      if (!isAnthropicSubscriptionAuthKey(apiKey)) {
        return;
      }
      this.anthropicSubscriptionWarningShown = true;
      this.showWarning(ANTHROPIC_SUBSCRIPTION_AUTH_WARNING);
    } catch {
    }
  }
  maybeSaveImplicitProjectTrustAfterReload() {
    const cwd = this.sessionManager.getCwd();
    if (this.autoTrustOnReloadCwd !== cwd) {
      return false;
    }
    if (!this.settingsManager.isProjectTrusted() || !hasTrustRequiringProjectResources(cwd)) {
      return false;
    }
    const trustStore = new ProjectTrustStore(this.runtimeHost.services.agentDir);
    try {
      if (trustStore.get(cwd) !== null) {
        this.autoTrustOnReloadCwd = void 0;
        return false;
      }
      trustStore.set(cwd, true);
      this.autoTrustOnReloadCwd = void 0;
      return true;
    } catch (error) {
      this.showWarning(
        `Could not save project trust after reload: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
  showTrustSelector() {
    const cwd = this.sessionManager.getCwd();
    const trustStore = new ProjectTrustStore(this.runtimeHost.services.agentDir);
    const savedDecision = trustStore.getEntry(cwd);
    this.showSelector((done) => {
      const selector = new TrustSelectorComponent({
        cwd,
        savedDecision,
        projectTrusted: this.settingsManager.isProjectTrusted(),
        onSelect: (selection) => {
          trustStore.setMany(selection.updates);
          done();
          this.showStatus(
            `Saved trust decision: ${selection.trusted ? "trusted" : "untrusted"}. Restart ${APP_NAME} for this to take effect.`
          );
        },
        onCancel: () => {
          done();
          this.ui.requestRender();
        }
      });
      return { component: selector, focus: selector };
    });
  }
  showModelSelector(initialSearchInput) {
    this.showSelector((done) => {
      const selectModel = async (model, persist) => {
        try {
          await this.session.setModel(model, { persist });
          this.footer.invalidate();
          this.updateEditorBorderColor();
          done();
          this.showStatus(persist ? `Default model: ${model.provider}/${model.id}` : `Model: ${model.id}`);
          void this.maybeWarnAboutAnthropicSubscriptionAuth(model);
          this.checkDaxnutsEasterEgg(model);
        } catch (error) {
          done();
          this.showError(error instanceof Error ? error.message : String(error));
        }
      };
      const defaultProvider = this.settingsManager.getDefaultProvider();
      const defaultModel = this.settingsManager.getDefaultModel();
      const selector = new ModelSelectorComponent(
        this.ui,
        this.session.model,
        this.session.modelRuntime,
        this.session.scopedModels,
        (model) => selectModel(model, false),
        () => {
          done();
          this.ui.requestRender();
        },
        initialSearchInput,
        (model) => selectModel(model, true),
        defaultProvider && defaultModel ? { provider: defaultProvider, id: defaultModel } : void 0
      );
      return { component: selector, focus: selector, dispose: () => selector.dispose() };
    });
  }
  showModelsSelector() {
    let availableModels = [...this.session.modelRuntime.getAvailableSnapshot()];
    let availableModelIds = new Set(availableModels.map((model) => `${model.provider}/${model.id}`));
    const configuredPatterns = this.settingsManager.getEnabledModels();
    const sessionScopedModels = this.session.scopedModels;
    const configuredEnabledIds = (models) => {
      if (!configuredPatterns?.length) return null;
      const resolved = resolveModelScopeFromModels(configuredPatterns, models);
      const ids = resolved.scopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`);
      for (const diagnostic of resolved.diagnostics) {
        if (diagnostic.code === "no-match" && !ids.includes(diagnostic.pattern)) ids.push(diagnostic.pattern);
      }
      return ids;
    };
    let currentEnabledIds = sessionScopedModels.length > 0 ? sessionScopedModels.map((scoped) => `${scoped.model.provider}/${scoped.model.id}`) : configuredEnabledIds(availableModels);
    let selectionChanged = false;
    const updateSessionModels = (enabledIds) => {
      currentEnabledIds = enabledIds === null ? null : [...enabledIds];
      const hasEnabledAvailableModel = enabledIds?.some((id) => availableModelIds.has(id)) ?? false;
      const allAvailableModelsEnabled = enabledIds !== null && [...availableModelIds].every((id) => enabledIds.includes(id));
      if (enabledIds && hasEnabledAvailableModel && !allAvailableModelsEnabled) {
        const newScopedModels = resolveModelScopeFromModels(enabledIds, availableModels).scopedModels;
        this.session.setScopedModels(
          newScopedModels.map((scoped) => ({
            model: scoped.model,
            thinkingLevel: scoped.thinkingLevel
          }))
        );
      } else {
        this.session.setScopedModels([]);
      }
      this.updateAvailableProviderCount();
      this.ui.requestRender();
    };
    this.showSelector((done) => {
      let disposed = false;
      let timedOut = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15e3);
      const selector = new ScopedModelsSelectorComponent(
        {
          allModels: availableModels,
          enabledModelIds: currentEnabledIds,
          refreshStatus: "Refreshing model catalogs\u2026"
        },
        {
          onChange: (enabledIds) => {
            selectionChanged = true;
            updateSessionModels(enabledIds);
          },
          onPersist: (enabledIds) => {
            const allEnabled = enabledIds !== null && enabledIds.length === availableModels.length && enabledIds.every((id) => availableModelIds.has(id));
            const newPatterns = enabledIds === null || allEnabled ? void 0 : enabledIds;
            this.settingsManager.setEnabledModels(newPatterns ? [...newPatterns] : void 0);
            this.showStatus("Model selection saved to settings");
          },
          onCancel: () => {
            done();
            this.ui.requestRender();
          }
        }
      );
      void refreshModelCatalogs(this.session.modelRuntime, controller.signal).then((result) => {
        if (disposed) return;
        availableModels = [...this.session.modelRuntime.getAvailableSnapshot()];
        availableModelIds = new Set(availableModels.map((model) => `${model.provider}/${model.id}`));
        if (!selectionChanged && sessionScopedModels.length === 0) {
          currentEnabledIds = configuredEnabledIds(availableModels);
          selector.updateModels(availableModels, currentEnabledIds);
        } else {
          selector.updateModels(availableModels);
        }
        if (currentEnabledIds !== null) updateSessionModels(currentEnabledIds);
        if (result.aborted && timedOut) {
          selector.setRefreshStatus("Model refresh timed out; showing cached models.", "warning");
        } else if (result.errors.size > 0) {
          selector.setRefreshStatus(
            `Could not refresh ${[...result.errors.keys()].join(", ")}; showing cached models.`,
            "warning"
          );
        } else {
          selector.setRefreshStatus("Model catalogs refreshed.", "success");
        }
        this.ui.requestRender();
      }).catch((error) => {
        if (disposed) return;
        selector.setRefreshStatus(
          timedOut ? "Model refresh timed out; showing cached models." : `Could not refresh model catalogs: ${error instanceof Error ? error.message : String(error)}`,
          "warning"
        );
        this.ui.requestRender();
      }).finally(() => clearTimeout(timeout));
      return {
        component: selector,
        focus: selector,
        dispose: () => {
          disposed = true;
          clearTimeout(timeout);
          controller.abort();
        }
      };
    });
  }
  showUserMessageSelector() {
    const userMessages = this.session.getUserMessagesForForking();
    if (userMessages.length === 0) {
      this.showStatus("No messages to fork from");
      return;
    }
    const initialSelectedId = userMessages[userMessages.length - 1]?.entryId;
    this.showSelector((done) => {
      const selector = new UserMessageSelectorComponent(
        userMessages.map((m) => ({ id: m.entryId, text: m.text })),
        async (entryId) => {
          done();
          try {
            const result = await this.runtimeHost.fork(entryId);
            if (result.cancelled) {
              this.ui.requestRender();
              return;
            }
            this.editor.setText(result.selectedText ?? "");
            this.showStatus("Forked to new session");
          } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
          }
        },
        () => {
          done();
          this.ui.requestRender();
        },
        initialSelectedId
      );
      return { component: selector, focus: selector.getMessageList() };
    });
  }
  async handleCloneCommand() {
    const leafId = this.sessionManager.getLeafId();
    if (!leafId) {
      this.showStatus("Nothing to clone yet");
      return;
    }
    try {
      const result = await this.runtimeHost.fork(leafId, { position: "at" });
      if (result.cancelled) {
        this.ui.requestRender();
        return;
      }
      this.editor.setText("");
      this.showStatus("Cloned to new session");
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }
  showTreeSelector(initialSelectedId) {
    const tree = this.sessionManager.getTree();
    const realLeafId = this.sessionManager.getLeafId();
    const initialFilterMode = this.settingsManager.getTreeFilterMode();
    if (tree.length === 0) {
      this.showStatus("No entries in session");
      return;
    }
    this.showSelector((done) => {
      const selector = new TreeSelectorComponent(
        tree,
        realLeafId,
        this.ui.terminal.rows,
        async (entryId) => {
          if (entryId === this.sessionManager.getLeafId()) {
            done();
            this.showStatus("Already at this point");
            return;
          }
          done();
          let wantsSummary = false;
          let customInstructions;
          if (!this.settingsManager.getBranchSummarySkipPrompt()) {
            while (true) {
              const summaryChoice = await this.showExtensionSelector("Summarize branch?", [
                "No summary",
                "Summarize",
                "Summarize with custom prompt"
              ]);
              if (summaryChoice === void 0) {
                this.showTreeSelector(entryId);
                return;
              }
              wantsSummary = summaryChoice !== "No summary";
              if (summaryChoice === "Summarize with custom prompt") {
                customInstructions = await this.showExtensionEditor("Custom summarization instructions");
                if (customInstructions === void 0) {
                  continue;
                }
              }
              break;
            }
          }
          if (this.session.isStreaming) {
            this.restoreQueuedMessagesToEditor();
            await this.session.abort();
          }
          let showingSummaryIndicator = false;
          const originalOnEscape = this.defaultEditor.onEscape;
          if (wantsSummary) {
            this.defaultEditor.onEscape = () => {
              this.session.abortBranchSummary();
            };
            this.chatContainer.addChild(new Spacer(1));
            this.showStatusIndicator(new BranchSummaryStatusIndicator(this.ui));
            showingSummaryIndicator = true;
            this.ui.requestRender();
          }
          try {
            const result = await this.session.navigateTree(entryId, {
              summarize: wantsSummary,
              customInstructions
            });
            if (result.aborted) {
              this.showStatus("Branch summarization cancelled");
              this.showTreeSelector(entryId);
              return;
            }
            if (result.cancelled) {
              this.showStatus("Navigation cancelled");
              return;
            }
            this.chatContainer.clear();
            this.renderInitialMessages();
            if (result.editorText && !this.editor.getText().trim()) {
              this.editor.setText(result.editorText);
            }
            this.showStatus("Navigated to selected point");
            void this.flushCompactionQueue({ willRetry: false });
          } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
          } finally {
            if (showingSummaryIndicator) {
              this.clearStatusIndicator("branchSummary");
            }
            this.defaultEditor.onEscape = originalOnEscape;
          }
        },
        () => {
          done();
          this.ui.requestRender();
        },
        (entryId, label) => {
          this.sessionManager.appendLabelChange(entryId, label);
          this.ui.requestRender();
        },
        initialSelectedId,
        initialFilterMode
      );
      selector.onCopy = async (text) => {
        if (!text) {
          this.showError("Selected entry has no text to copy");
          return;
        }
        try {
          await copyToClipboard(text);
          this.showStatus("Copied selected message to clipboard");
        } catch (error) {
          this.showError(error instanceof Error ? error.message : String(error));
        }
      };
      return { component: selector, focus: selector };
    });
  }
  showSessionSelector() {
    this.showSelector((done) => {
      const selector = new SessionSelectorComponent(
        (onProgress) => SessionManager.list(this.sessionManager.getCwd(), this.sessionManager.getSessionDir(), onProgress),
        (onProgress) => this.sessionManager.usesDefaultSessionDir() ? SessionManager.listAll(onProgress) : SessionManager.listAll(this.sessionManager.getSessionDir(), onProgress),
        async (sessionPath) => {
          done();
          await this.handleResumeSession(sessionPath);
        },
        () => {
          done();
          this.ui.requestRender();
        },
        () => {
          void this.shutdown();
        },
        () => this.ui.requestRender(),
        {
          renameSession: async (sessionFilePath, nextName) => {
            const next = (nextName ?? "").trim();
            if (!next) return;
            const mgr = SessionManager.open(sessionFilePath);
            mgr.appendSessionInfo(next);
          },
          showRenameHint: true,
          keybindings: this.keybindings
        },
        this.sessionManager.getSessionFile()
      );
      return { component: selector, focus: selector };
    });
  }
  async handleResumeSession(sessionPath, options) {
    this.clearStatusIndicator();
    try {
      const result = await this.runtimeHost.switchSession(sessionPath, {
        withSession: options?.withSession,
        projectTrustContextFactory: (cwd) => this.createProjectTrustContext(cwd)
      });
      if (result.cancelled) {
        return result;
      }
      this.showStatus("Resumed session");
      return result;
    } catch (error) {
      if (error instanceof MissingSessionCwdError) {
        const selectedCwd = await this.promptForMissingSessionCwd(error);
        if (!selectedCwd) {
          this.showStatus("Resume cancelled");
          return { cancelled: true };
        }
        const result = await this.runtimeHost.switchSession(sessionPath, {
          cwdOverride: selectedCwd,
          withSession: options?.withSession,
          projectTrustContextFactory: (cwd) => this.createProjectTrustContext(cwd)
        });
        if (result.cancelled) {
          return result;
        }
        this.showStatus("Resumed session in current cwd");
        return result;
      }
      return this.handleFatalRuntimeError("Failed to resume session", error);
    }
  }
  getLoginProviderOptions(authType) {
    const options = [];
    for (const provider of this.session.modelRuntime.getProviders()) {
      const authStatus = this.session.modelRuntime.getProviderAuthStatus(provider.id);
      const status = authStatus.configured ? {
        type: this.session.modelRuntime.isUsingOAuth(provider.id) ? "oauth" : "api_key",
        source: authStatus.label ?? authStatus.source
      } : void 0;
      if ((!authType || authType === "oauth") && provider.auth.oauth) {
        options.push({
          id: provider.id,
          name: provider.name,
          authType: "oauth",
          method: provider.auth.oauth,
          status
        });
      }
      if ((!authType || authType === "api_key") && provider.auth.apiKey) {
        options.push({
          id: provider.id,
          name: provider.name,
          authType: "api_key",
          method: provider.auth.apiKey,
          status
        });
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }
  async getLogoutProviderOptions() {
    return (await this.session.modelRuntime.listCredentials({ signal: AbortSignal.timeout(15e3) })).map(({ providerId, type }) => ({
      id: providerId,
      name: this.session.modelRuntime.getProvider(providerId)?.name ?? providerId,
      authType: type,
      status: { type, source: "stored credential" }
    })).sort((a, b) => a.name.localeCompare(b.name));
  }
  findLoginProviderOptions(providerRef) {
    const normalizedProviderRef = providerRef.trim().toLowerCase();
    if (!normalizedProviderRef) {
      return [];
    }
    return this.getLoginProviderOptions().filter(
      (provider) => provider.id.toLowerCase() === normalizedProviderRef || provider.name.toLowerCase() === normalizedProviderRef
    );
  }
  async handleLoginCommand(providerRef) {
    if (!providerRef) {
      this.showLoginAuthTypeSelector();
      return;
    }
    const providerOptions = this.findLoginProviderOptions(providerRef);
    if (providerOptions.length === 1) {
      await this.startProviderLogin(providerOptions[0]);
      return;
    }
    if (providerOptions.length > 1) {
      const providerIds = new Set(providerOptions.map((provider) => provider.id));
      if (providerIds.size === 1) {
        this.showLoginAuthTypeSelector(providerOptions);
        return;
      }
    }
    this.showLoginProviderSelector(void 0, providerRef);
  }
  async startProviderLogin(providerOption) {
    if (providerOption.authType === "oauth") {
      await this.showLoginDialog(providerOption.id, providerOption.name);
    } else if (providerOption.method?.login) {
      await this.showApiKeyLoginDialog(providerOption.id, providerOption.name);
    } else {
      this.showAmbientAuthDialog(providerOption);
    }
  }
  showLoginAuthTypeSelector(providerOptions) {
    const oauthProvider = providerOptions?.find((provider) => provider.authType === "oauth");
    const oauthLoginLabel = oauthProvider?.method && "loginLabel" in oauthProvider.method ? oauthProvider.method.loginLabel : void 0;
    const subscriptionLabel = oauthLoginLabel ?? "Sign in with an account";
    const apiKeyLabel = "Sign in with an API key";
    const availableAuthTypes = providerOptions ? new Set(providerOptions.map((provider) => provider.authType)) : /* @__PURE__ */ new Set(["oauth", "api_key"]);
    const options = [];
    if (availableAuthTypes.has("oauth")) {
      options.push(subscriptionLabel);
    }
    if (availableAuthTypes.has("api_key")) {
      options.push(apiKeyLabel);
    }
    if (options.length === 0) {
      this.showStatus("No login methods available.");
      return;
    }
    if (providerOptions && options.length === 1) {
      const providerOption = providerOptions[0];
      if (providerOption) {
        void this.startProviderLogin(providerOption);
      }
      return;
    }
    const title = providerOptions?.[0] ? `Select authentication method for ${providerOptions[0].name}:` : "Select authentication method:";
    this.showSelector((done) => {
      const selector = new ExtensionSelectorComponent(
        title,
        options,
        (option) => {
          done();
          const authType = option === subscriptionLabel ? "oauth" : "api_key";
          if (providerOptions) {
            const providerOption = providerOptions.find((provider) => provider.authType === authType);
            if (providerOption) {
              void this.startProviderLogin(providerOption);
            }
            return;
          }
          this.showLoginProviderSelector(authType);
        },
        () => {
          done();
          this.ui.requestRender();
        }
      );
      return { component: selector, focus: selector };
    });
  }
  showLoginProviderSelector(authType, initialSearchInput) {
    const providerOptions = this.getLoginProviderOptions(authType);
    if (providerOptions.length === 0) {
      const message = authType === "oauth" ? "No subscription providers available." : authType === "api_key" ? "No API key providers available." : "No login providers available.";
      this.showStatus(message);
      return;
    }
    this.showSelector((done) => {
      const selector = new OAuthSelectorComponent(
        "login",
        providerOptions,
        async (providerId, selectedAuthType) => {
          done();
          const providerOption = providerOptions.find(
            (provider) => provider.id === providerId && provider.authType === selectedAuthType
          );
          if (!providerOption) {
            return;
          }
          await this.startProviderLogin(providerOption);
        },
        () => {
          done();
          if (authType) {
            this.showLoginAuthTypeSelector();
          } else {
            this.ui.requestRender();
          }
        },
        initialSearchInput
      );
      return { component: selector, focus: selector };
    });
  }
  async showOAuthSelector(mode) {
    if (mode === "login") {
      this.showLoginAuthTypeSelector();
      return;
    }
    let providerOptions;
    try {
      providerOptions = await this.getLogoutProviderOptions();
    } catch (error) {
      this.showError(`Could not read stored credentials: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (providerOptions.length === 0) {
      this.showStatus(
        "No stored credentials to remove. /logout only removes credentials saved by /login; environment variables and models.json config are unchanged."
      );
      return;
    }
    this.showSelector((done) => {
      const selector = new OAuthSelectorComponent(
        mode,
        providerOptions,
        async (providerId) => {
          done();
          const providerOption = providerOptions.find((provider) => provider.id === providerId);
          if (!providerOption) {
            return;
          }
          try {
            await this.session.modelRuntime.logout(providerOption.id, {
              signal: AbortSignal.timeout(15e3)
            });
            await this.updateAvailableProviderCount();
            const message = providerOption.authType === "oauth" ? `Logged out of ${providerOption.name}` : `Removed stored API key for ${providerOption.name}. Environment variables and models.json config are unchanged.`;
            this.showStatus(message);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.showError(
              error instanceof CredentialSynchronizationError ? `Credentials removed for ${providerOption.name}, but local model state could not be synchronized: ${message}` : `Logout failed: ${message}`
            );
          }
        },
        () => {
          done();
          this.ui.requestRender();
        }
      );
      return { component: selector, focus: selector };
    });
  }
  async completeProviderAuthentication(providerId, providerName, authType, previousModel) {
    const actionLabel = authType === "oauth" ? `Logged in to ${providerName}` : `Saved API key for ${providerName}`;
    let selectedModel;
    let selectionError;
    if (isUnknownModel(previousModel)) {
      const availableModels = this.session.modelRuntime.getAvailableSnapshot();
      const providerModels = availableModels.filter((model) => model.provider === providerId);
      if (providerId === "llama.cpp") {
        selectionError = llamaCppPostLoginGuidance(actionLabel, providerModels.length);
      } else if (!hasDefaultModelProvider(providerId)) {
        selectionError = `${actionLabel}, but no default model is configured for provider "${providerId}". Use /model to select a model.`;
      } else if (providerModels.length === 0) {
        selectionError = `${actionLabel}, but no models are available for that provider. Use /model to select a model.`;
      } else {
        const defaultModelId = defaultModelPerProvider[providerId];
        selectedModel = providerModels.find((model) => model.id === defaultModelId);
        if (!selectedModel) {
          selectionError = `${actionLabel}, but its default model "${defaultModelId}" is not available. Use /model to select a model.`;
        } else {
          try {
            await this.session.setModel(selectedModel, { persist: true });
          } catch (error) {
            selectedModel = void 0;
            const errorMessage = error instanceof Error ? error.message : String(error);
            selectionError = `${actionLabel}, but selecting its default model failed: ${errorMessage}. Use /model to select a model.`;
          }
        }
      }
    }
    await this.updateAvailableProviderCount();
    this.footer.invalidate();
    this.updateEditorBorderColor();
    if (selectedModel) {
      this.showStatus(`${actionLabel}. Selected ${selectedModel.id}. Credentials saved to ${getAuthPath()}`);
      void this.maybeWarnAboutAnthropicSubscriptionAuth(selectedModel);
      this.checkDaxnutsEasterEgg(selectedModel);
    } else {
      this.showStatus(`${actionLabel}. Credentials saved to ${getAuthPath()}`);
      if (selectionError) {
        this.showError(selectionError);
      } else {
        void this.maybeWarnAboutAnthropicSubscriptionAuth();
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    void this.session.modelRuntime.refresh({ providers: [providerId], signal: controller.signal }).then((result) => {
      if (result.aborted) {
        this.showWarning(`${actionLabel}, but its model catalog refresh timed out; using cached models.`);
      } else if (result.errors.size > 0) {
        this.showWarning(`${actionLabel}, but its model catalog could not be refreshed; using cached models.`);
      }
      this.updateAvailableProviderCount();
      this.footer.invalidate();
      this.ui.requestRender();
    }).catch((error) => {
      this.showWarning(
        `${actionLabel}, but its model catalog could not be refreshed: ${error instanceof Error ? error.message : String(error)}`
      );
    }).finally(() => clearTimeout(timeout));
  }
  showAmbientAuthDialog(providerOption) {
    const restoreEditor = () => {
      this.editorContainer.clear();
      this.editorContainer.addChild(this.editor);
      this.ui.setFocus(this.editor);
      this.ui.requestRender();
    };
    const dialog = new LoginDialogComponent(
      this.ui,
      providerOption.id,
      () => restoreEditor(),
      providerOption.name,
      `${providerOption.name} setup`
    );
    dialog.showInfo(
      `${providerOption.method?.name ?? "Authentication"} is configured outside ${APP_NAME}.`,
      [],
      true
    );
    this.editorContainer.clear();
    this.editorContainer.addChild(dialog);
    this.ui.setFocus(dialog);
    this.ui.requestRender();
  }
  async showApiKeyLoginDialog(providerId, providerName) {
    const previousModel = this.session.model;
    const dialog = new LoginDialogComponent(
      this.ui,
      providerId,
      (_success, _message) => {
      },
      providerName
    );
    if (providerId === "amazon-bedrock") {
      dialog.showDetails([
        theme.fg("text", "You can also use an AWS profile, IAM keys, or role-based credentials."),
        theme.fg("muted", "See:"),
        theme.fg("accent", `  ${path.join(getDocsPath(), "providers.md")}`)
      ]);
    }
    this.editorContainer.clear();
    this.editorContainer.addChild(dialog);
    this.ui.setFocus(dialog);
    this.ui.requestRender();
    const restoreEditor = () => {
      this.editorContainer.clear();
      this.editorContainer.addChild(this.editor);
      this.ui.setFocus(this.editor);
      this.ui.requestRender();
    };
    try {
      await this.loginProvider(dialog, providerId, "api_key");
      restoreEditor();
      await this.completeProviderAuthentication(providerId, providerName, "api_key", previousModel);
    } catch (error) {
      restoreEditor();
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof CredentialSynchronizationError) {
        this.showError(
          `Saved API key for ${providerName}, but local model state could not be synchronized: ${errorMsg}`
        );
      } else if (errorMsg !== "Login cancelled") {
        this.showError(`Failed to save API key for ${providerName}: ${errorMsg}`);
      }
    }
  }
  showAuthSelect(dialog, prompt) {
    return new Promise((resolve, reject) => {
      const restoreDialog = () => {
        this.editorContainer.clear();
        this.editorContainer.addChild(dialog);
        this.ui.setFocus(dialog);
        this.ui.requestRender();
      };
      const labels = prompt.options.map((option) => option.label);
      const selector = new ExtensionSelectorComponent(
        prompt.message,
        labels,
        (optionLabel) => {
          restoreDialog();
          const id = prompt.options.find((option) => option.label === optionLabel)?.id;
          if (id) resolve(id);
          else reject(new Error("Login cancelled"));
        },
        () => {
          restoreDialog();
          reject(new Error("Login cancelled"));
        }
      );
      this.editorContainer.clear();
      this.editorContainer.addChild(selector);
      this.ui.setFocus(selector);
      this.ui.requestRender();
    });
  }
  async showAuthPrompt(dialog, prompt) {
    let response;
    if (prompt.type === "select") {
      response = this.showAuthSelect(dialog, prompt);
    } else if (prompt.type === "manual_code") {
      response = dialog.showManualInput(prompt.message);
    } else {
      response = dialog.showPrompt(prompt.message, prompt.placeholder);
    }
    if (!prompt.signal) return response;
    if (prompt.signal.aborted) throw new Error("Login cancelled");
    const signal = prompt.signal;
    let onAbort;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(new Error("Login cancelled"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([response, aborted]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
  notifyAuthDialog(dialog, event) {
    if (event.type === "auth_url") {
      dialog.showAuth(event.url, event.instructions);
    } else if (event.type === "device_code") {
      dialog.showDeviceCode(event);
      dialog.showWaiting("Waiting for authentication...");
    } else if (event.type === "info") {
      dialog.showInfo(event.message, event.links);
    } else {
      dialog.showProgress(event.message);
    }
  }
  async loginProvider(dialog, providerId, method) {
    await this.session.modelRuntime.login(providerId, method, {
      signal: dialog.signal,
      prompt: (prompt) => this.showAuthPrompt(dialog, prompt),
      notify: (event) => this.notifyAuthDialog(dialog, event)
    });
  }
  async showLoginDialog(providerId, providerName) {
    const previousModel = this.session.model;
    const dialog = new LoginDialogComponent(this.ui, providerId, (_success, _message) => {
    }, providerName);
    this.editorContainer.clear();
    this.editorContainer.addChild(dialog);
    this.ui.setFocus(dialog);
    this.ui.requestRender();
    const restoreEditor = () => {
      this.editorContainer.clear();
      this.editorContainer.addChild(this.editor);
      this.ui.setFocus(this.editor);
      this.ui.requestRender();
    };
    try {
      await this.loginProvider(dialog, providerId, "oauth");
      restoreEditor();
      await this.completeProviderAuthentication(providerId, providerName, "oauth", previousModel);
    } catch (error) {
      restoreEditor();
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof CredentialSynchronizationError) {
        this.showError(
          `Logged in to ${providerName}, but local model state could not be synchronized: ${errorMsg}`
        );
      } else if (errorMsg !== "Login cancelled") {
        this.showError(`Failed to login to ${providerName}: ${errorMsg}`);
      }
    }
  }
  // =========================================================================
  // Command handlers
  // =========================================================================
  async handleReloadCommand() {
    if (this.session.isStreaming) {
      this.showWarning("Wait for the current response to finish before reloading.");
      return;
    }
    if (this.session.isCompacting) {
      this.showWarning("Wait for compaction to finish before reloading.");
      return;
    }
    this.resetExtensionUI();
    const reloadBox = new Container();
    const borderColor = (s) => theme.fg("border", s);
    reloadBox.addChild(new DynamicBorder(borderColor));
    reloadBox.addChild(new Spacer(1));
    reloadBox.addChild(
      new Text(
        theme.fg("muted", "Reloading keybindings, extensions, skills, prompts, themes, and context files..."),
        1,
        0
      )
    );
    reloadBox.addChild(new Spacer(1));
    reloadBox.addChild(new DynamicBorder(borderColor));
    const previousEditor = this.editor;
    this.editorContainer.clear();
    this.editorContainer.addChild(reloadBox);
    this.ui.setFocus(reloadBox);
    this.ui.requestRender(true);
    await new Promise((resolve) => process.nextTick(resolve));
    const dismissReloadBox = (editor) => {
      this.editorContainer.clear();
      this.editorContainer.addChild(editor);
      this.ui.setFocus(editor);
      this.ui.requestRender();
    };
    let chatRestoredBeforeSessionStart = false;
    let reloadBoxDismissed = false;
    const restoreChatBeforeSessionStart = () => {
      if (chatRestoredBeforeSessionStart) {
        return;
      }
      this.hideThinkingBlock = this.settingsManager.getHideThinkingBlock();
      this.outputPad = this.settingsManager.getOutputPad();
      this.rebuildChatFromMessages();
      chatRestoredBeforeSessionStart = true;
    };
    try {
      await this.session.reload({ beforeSessionStart: restoreChatBeforeSessionStart });
      restoreChatBeforeSessionStart();
      this.keybindings.reload();
      const activeHeader = this.customHeader ?? this.builtInHeader;
      if (isExpandable(activeHeader)) {
        activeHeader.setExpanded(this.toolOutputExpanded);
      }
      setRegisteredThemes(this.session.resourceLoader.getThemes().themes);
      await this.themeController.applyFromSettings();
      this.applyRuntimeSettings();
      this.setupAutocompleteProvider();
      const runner = this.session.extensionRunner;
      this.setupExtensionShortcuts(runner);
      this.showLoadedResources({
        force: false,
        showDiagnosticsWhenQuiet: true
      });
      const savedImplicitProjectTrust = this.maybeSaveImplicitProjectTrustAfterReload();
      const modelsJsonError = this.session.modelRuntime.getError();
      if (modelsJsonError) {
        this.showError(`models.json error: ${modelsJsonError}`);
      }
      this.showStatus(
        savedImplicitProjectTrust ? "Reloaded keybindings, extensions, skills, prompts, themes, and context files; saved project trust" : "Reloaded keybindings, extensions, skills, prompts, themes, and context files"
      );
      dismissReloadBox(this.editor);
      reloadBoxDismissed = true;
    } catch (error) {
      if (!reloadBoxDismissed) {
        dismissReloadBox(previousEditor);
      }
      this.showError(`Reload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async handleExportCommand(text) {
    const outputPath = this.getPathCommandArgument(text, "/export");
    try {
      if (outputPath?.endsWith(".jsonl")) {
        const filePath = this.session.exportToJsonl(outputPath);
        this.showStatus(`Session exported to: ${filePath}`);
      } else {
        const filePath = await this.session.exportToHtml(outputPath, {
          themeName: theme.name
        });
        this.showStatus(`Session exported to: ${filePath}`);
      }
    } catch (error) {
      this.showError(`Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  getPathCommandArgument(text, command) {
    if (text === command) {
      return void 0;
    }
    if (!text.startsWith(`${command} `)) {
      return void 0;
    }
    const argsString = text.slice(command.length + 1).trimStart();
    if (!argsString) {
      return void 0;
    }
    const firstChar = argsString[0];
    if (firstChar === '"' || firstChar === "'") {
      const closingQuoteIndex = argsString.indexOf(firstChar, 1);
      if (closingQuoteIndex < 0) {
        return void 0;
      }
      return argsString.slice(1, closingQuoteIndex);
    }
    const firstWhitespaceIndex = argsString.search(/\s/);
    if (firstWhitespaceIndex < 0) {
      return argsString;
    }
    return argsString.slice(0, firstWhitespaceIndex);
  }
  async handleImportCommand(text) {
    const inputPath = this.getPathCommandArgument(text, "/import");
    if (!inputPath) {
      this.showError("Usage: /import <path.jsonl>");
      return;
    }
    const confirmed = await this.showExtensionConfirm("Import session", `Replace current session with ${inputPath}?`);
    if (!confirmed) {
      this.showStatus("Import cancelled");
      return;
    }
    try {
      this.clearStatusIndicator();
      const result = await this.runtimeHost.importFromJsonl(inputPath);
      if (result.cancelled) {
        this.showStatus("Import cancelled");
        return;
      }
      this.showStatus(`Session imported from: ${inputPath}`);
    } catch (error) {
      if (error instanceof MissingSessionCwdError) {
        const selectedCwd = await this.promptForMissingSessionCwd(error);
        if (!selectedCwd) {
          this.showStatus("Import cancelled");
          return;
        }
        const result = await this.runtimeHost.importFromJsonl(inputPath, selectedCwd);
        if (result.cancelled) {
          this.showStatus("Import cancelled");
          return;
        }
        this.showStatus(`Session imported from: ${inputPath}`);
        return;
      }
      if (error instanceof SessionImportFileNotFoundError) {
        this.showError(`Failed to import session: ${error.message}`);
        return;
      }
      await this.handleFatalRuntimeError("Failed to import session", error);
    }
  }
  async handleShareCommand() {
    await shareSession({
      session: this.session,
      ui: this.ui,
      editorContainer: this.editorContainer,
      editor: this.editor,
      showStatus: (message) => this.showStatus(message),
      showError: (message) => this.showError(message)
    });
  }
  async handleCopyCommand(options = {}) {
    const text = this.session.getLastAssistantText();
    if (!text) {
      this.showError("No agent messages to copy yet.");
      return;
    }
    try {
      await copyToClipboard(text);
      if (options.flashConfirmation && this.ui instanceof TuiAltScreen) {
        this.ui.flash("Copied!");
      } else {
        this.showStatus("Copied last agent message to clipboard");
      }
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }
  handleNameCommand(text) {
    const name = text.replace(/^\/name\s*/, "").trim();
    if (!name) {
      const currentName = this.sessionManager.getSessionName();
      if (currentName) {
        this.chatContainer.addChild(new Spacer(1));
        this.chatContainer.addChild(new Text(theme.fg("dim", `Session name: ${currentName}`), 1, 0));
      } else {
        this.showWarning("Usage: /name <name>");
      }
      this.ui.requestRender();
      return;
    }
    this.session.setSessionName(name);
    const sessionName = this.sessionManager.getSessionName();
    if (sessionName !== name) {
      this.showWarning(`Session name was normalized from ${JSON.stringify(name)} to ${JSON.stringify(sessionName)}`);
    }
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(theme.fg("dim", `Session name set: ${sessionName ?? name}`), 1, 0));
    this.ui.requestRender();
  }
  handleSessionCommand() {
    const stats = this.session.getSessionStats();
    const sessionName = this.sessionManager.getSessionName();
    const entries = this.sessionManager.getEntries();
    const cacheWaste = computeCacheWaste(entries, this.session.modelRuntime);
    const usageBreakdown = getUsageCostBreakdown(entries);
    let info = `${theme.bold("Session Info")}

`;
    if (sessionName) {
      info += `${theme.fg("dim", "Name:")} ${sessionName}
`;
    }
    info += `${theme.fg("dim", "File:")} ${stats.sessionFile ?? "In-memory"}
`;
    info += `${theme.fg("dim", "ID:")} ${stats.sessionId}

`;
    info += `${theme.bold("Messages")}
`;
    info += `${theme.fg("dim", "Total:")} ${stats.totalMessages}
`;
    info += `${theme.fg("dim", "User:")} ${stats.userMessages}
`;
    info += `${theme.fg("dim", "Assistant:")} ${stats.assistantMessages}
`;
    info += `${theme.fg("dim", "Tools:")} ${stats.toolCalls} calls, ${stats.toolResults} results

`;
    info += `${theme.bold("Tokens")}
`;
    const { input, cacheRead, cacheWrite } = stats.tokens;
    const promptTokens = input + cacheRead + cacheWrite;
    info += `${theme.fg("dim", "Input:")} ${promptTokens.toLocaleString()}
`;
    if (promptTokens > 0 && (cacheRead > 0 || cacheWrite > 0)) {
      const hitRate = theme.fg("dim", `(${(cacheRead / promptTokens * 100).toFixed(1)}%)`);
      info += `  ${theme.fg("dim", "Cached:")} ${cacheRead.toLocaleString()} ${hitRate}
`;
      const written = cacheWrite > 0 ? ` ${theme.fg("dim", `(${cacheWrite.toLocaleString()} written to cache)`)}` : "";
      info += `  ${theme.fg("dim", "Uncached:")} ${(input + cacheWrite).toLocaleString()}${written}
`;
    }
    info += `${theme.fg("dim", "Output:")} ${stats.tokens.output.toLocaleString()}
`;
    info += `${theme.fg("dim", "Total:")} ${stats.tokens.total.toLocaleString()}
`;
    if (stats.cost > 0 || cacheWaste.missedTokens > 0) {
      info += `
${theme.bold("Cost")}
`;
      info += `${theme.fg("dim", "Total:")} $${stats.cost.toFixed(3)}`;
      if (usageBreakdown.length > 1) {
        for (const entry of usageBreakdown) {
          info += `
  ${theme.fg("dim", `${entry.key}:`)} $${entry.cost.toFixed(3)} ${theme.fg("dim", `(${formatTokens(entry.tokens)} tokens)`)}`;
        }
      }
      if (cacheWaste.missedTokens > 0) {
        const missLabel = cacheWaste.missCount === 1 ? "1 miss" : `${cacheWaste.missCount} misses`;
        const detail = `${cacheWaste.missedTokens.toLocaleString()} tokens, ${missLabel}`;
        info += cacheWaste.missedCost >= 1e-4 ? `
${theme.fg("dim", "Cache Re-billed:")} $${cacheWaste.missedCost.toFixed(3)} ${theme.fg("dim", `(${detail})`)}` : `
${theme.fg("dim", "Cache Re-billed:")} ${detail}`;
      }
    }
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(info, 1, 0));
    this.ui.requestRender();
  }
  handleChangelogCommand() {
    const changelogPath = getChangelogPath();
    const allEntries = parseChangelog(changelogPath);
    const changelogMarkdown = allEntries.length > 0 ? allEntries.reverse().map((e) => normalizeChangelogLinks(e.content, e)).join("\n\n") : "No changelog entries found.";
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DynamicBorder());
    this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "What's New")), 1, 0));
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Markdown(changelogMarkdown, 1, 1, this.getMarkdownThemeWithSettings()));
    this.chatContainer.addChild(new DynamicBorder());
    this.ui.requestRender();
  }
  /**
   * Get capitalized display string for an app keybinding action.
   */
  getAppKeyDisplay(action) {
    return keyDisplayText(action);
  }
  /**
   * Get capitalized display string for an editor keybinding action.
   */
  getEditorKeyDisplay(action) {
    return keyDisplayText(action);
  }
  handleHotkeysCommand() {
    const cursorUp = this.getEditorKeyDisplay("tui.editor.cursorUp");
    const cursorDown = this.getEditorKeyDisplay("tui.editor.cursorDown");
    const cursorLeft = this.getEditorKeyDisplay("tui.editor.cursorLeft");
    const cursorRight = this.getEditorKeyDisplay("tui.editor.cursorRight");
    const cursorWordLeft = this.getEditorKeyDisplay("tui.editor.cursorWordLeft");
    const cursorWordRight = this.getEditorKeyDisplay("tui.editor.cursorWordRight");
    const cursorLineStart = this.getEditorKeyDisplay("tui.editor.cursorLineStart");
    const cursorLineEnd = this.getEditorKeyDisplay("tui.editor.cursorLineEnd");
    const jumpForward = this.getEditorKeyDisplay("tui.editor.jumpForward");
    const jumpBackward = this.getEditorKeyDisplay("tui.editor.jumpBackward");
    const pageUp = this.getEditorKeyDisplay("tui.editor.pageUp");
    const pageDown = this.getEditorKeyDisplay("tui.editor.pageDown");
    const submit = this.getEditorKeyDisplay("tui.input.submit");
    const newLine = this.getEditorKeyDisplay("tui.input.newLine");
    const deleteWordBackward = this.getEditorKeyDisplay("tui.editor.deleteWordBackward");
    const deleteWordForward = this.getEditorKeyDisplay("tui.editor.deleteWordForward");
    const deleteToLineStart = this.getEditorKeyDisplay("tui.editor.deleteToLineStart");
    const deleteToLineEnd = this.getEditorKeyDisplay("tui.editor.deleteToLineEnd");
    const yank = this.getEditorKeyDisplay("tui.editor.yank");
    const yankPop = this.getEditorKeyDisplay("tui.editor.yankPop");
    const undo = this.getEditorKeyDisplay("tui.editor.undo");
    const tab = this.getEditorKeyDisplay("tui.input.tab");
    const interrupt = this.getAppKeyDisplay("app.interrupt");
    const clear = this.getAppKeyDisplay("app.clear");
    const exit = this.getAppKeyDisplay("app.exit");
    const suspend = this.getAppKeyDisplay("app.suspend");
    const cycleThinkingLevel = this.getAppKeyDisplay("app.thinking.cycle");
    const cycleModelForward = this.getAppKeyDisplay("app.model.cycleForward");
    const selectModel = this.getAppKeyDisplay("app.model.select");
    const expandTools = this.getAppKeyDisplay("app.tools.expand");
    const toggleThinking = this.getAppKeyDisplay("app.thinking.toggle");
    const externalEditor = this.getAppKeyDisplay("app.editor.external");
    const cycleModelBackward = this.getAppKeyDisplay("app.model.cycleBackward");
    const copyMessage = this.getAppKeyDisplay("app.message.copy");
    const followUp = this.getAppKeyDisplay("app.message.followUp");
    const dequeue = this.getAppKeyDisplay("app.message.dequeue");
    const pasteImage = this.getAppKeyDisplay("app.clipboard.pasteImage");
    let hotkeys = `
**Navigation**
| Key | Action |
|-----|--------|
| \`${cursorUp}\` / \`${cursorDown}\` / \`${cursorLeft}\` / \`${cursorRight}\` | Move cursor / browse history |
| \`${cursorWordLeft}\` / \`${cursorWordRight}\` | Move by word |
| \`${cursorLineStart}\` | Start of line |
| \`${cursorLineEnd}\` | End of line |
| \`${jumpForward}\` | Jump forward to character |
| \`${jumpBackward}\` | Jump backward to character |
| \`${pageUp}\` / \`${pageDown}\` | Scroll by page |

**Editing**
| Key | Action |
|-----|--------|
| \`${submit}\` | Send message |
| \`${newLine}\` | New line${process.platform === "win32" ? " (Ctrl+Enter on Windows Terminal)" : ""} |
| \`${deleteWordBackward}\` | Delete word backwards |
| \`${deleteWordForward}\` | Delete word forwards |
| \`${deleteToLineStart}\` | Delete to start of line |
| \`${deleteToLineEnd}\` | Delete to end of line |
| \`${yank}\` | Paste the most-recently-deleted text |
| \`${yankPop}\` | Cycle through the deleted text after pasting |
| \`${undo}\` | Undo |

**Other**
| Key | Action |
|-----|--------|
| \`${tab}\` | Path completion / accept autocomplete |
| \`${interrupt}\` | Cancel autocomplete / abort streaming |
| \`${clear}\` | Clear editor (first) / exit (second) |
| \`${exit}\` | Exit (when editor is empty) |
| \`${suspend}\` | Suspend to background |
| \`${cycleThinkingLevel}\` | Cycle thinking level |
| \`${cycleModelForward}\` / \`${cycleModelBackward}\` | Cycle models |
| \`${selectModel}\` | Open model selector |
| \`${expandTools}\` | Toggle tool output expansion |
| \`${toggleThinking}\` | Toggle thinking block visibility |
| \`${externalEditor}\` | Edit message in external editor |
| \`${copyMessage}\` | Copy last assistant message |
| \`${followUp}\` | Queue follow-up message |
| \`${dequeue}\` | Restore queued messages |
| \`${pasteImage}\` | Paste image or text from clipboard |
| \`/\` | Slash commands |
| \`!\` | Run bash command |
| \`!!\` | Run bash command (excluded from context) |
`;
    const extensionRunner = this.session.extensionRunner;
    const shortcuts = extensionRunner.getShortcuts(this.keybindings.getEffectiveConfig());
    if (shortcuts.size > 0) {
      hotkeys += `
**Extensions**
| Key | Action |
|-----|--------|
`;
      for (const [key, shortcut] of shortcuts) {
        const description = shortcut.description ?? shortcut.extensionPath;
        const keyDisplay = formatKeyText(key, { capitalize: true });
        hotkeys += `| \`${keyDisplay}\` | ${description} |
`;
      }
    }
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DynamicBorder());
    this.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "Keyboard Shortcuts")), 1, 0));
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Markdown(hotkeys.trim(), 1, 1, this.getMarkdownThemeWithSettings()));
    this.chatContainer.addChild(new DynamicBorder());
    this.ui.requestRender();
  }
  async handleClearCommand() {
    this.clearStatusIndicator();
    try {
      const result = await this.runtimeHost.newSession();
      if (result.cancelled) {
        return;
      }
      this.chatContainer.addChild(new Spacer(1));
      this.chatContainer.addChild(new Text(`${theme.fg("accent", "\u2713 New session started")}`, 1, 1));
      this.ui.requestRender();
    } catch (error) {
      await this.handleFatalRuntimeError("Failed to create session", error);
    }
  }
  handleDebugCommand() {
    const width = this.ui.terminal.columns;
    const height = this.ui.terminal.rows;
    const allLines = this.ui.render(width);
    const debugLogPath = getDebugLogPath();
    const debugData = [
      `Debug output at ${(/* @__PURE__ */ new Date()).toISOString()}`,
      `Terminal: ${width}x${height}`,
      `Total lines: ${allLines.length}`,
      "",
      "=== All rendered lines with visible widths ===",
      ...allLines.map((line, idx) => {
        const vw = visibleWidth(line);
        const escaped = JSON.stringify(line);
        return `[${idx}] (w=${vw}) ${escaped}`;
      }),
      "",
      "=== Agent messages (JSONL) ===",
      ...this.session.messages.map((msg) => JSON.stringify(msg)),
      ""
    ].join("\n");
    fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
    fs.writeFileSync(debugLogPath, debugData);
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(
      new Text(`${theme.fg("accent", "\u2713 Debug log written")}
${theme.fg("muted", debugLogPath)}`, 1, 1)
    );
    this.ui.requestRender();
  }
  handleArminSaysHi() {
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new ArminComponent(this.ui));
    this.ui.requestRender();
  }
  handleDementedDelves() {
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new EarendilAnnouncementComponent());
    this.ui.requestRender();
  }
  handleDaxnuts() {
    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new DaxnutsComponent(this.ui));
    this.ui.requestRender();
  }
  checkDaxnutsEasterEgg(model) {
    if (model.provider === "opencode" && model.id.toLowerCase().includes("kimi-k2.5")) {
      this.handleDaxnuts();
    }
  }
  async handleBashCommand(command, excludeFromContext = false) {
    const extensionRunner = this.session.extensionRunner;
    const eventResult = await extensionRunner.emitUserBash({
      type: "user_bash",
      command,
      excludeFromContext,
      cwd: this.sessionManager.getCwd()
    });
    if (eventResult?.result) {
      const result = eventResult.result;
      this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
      if (this.session.isStreaming) {
        this.pendingMessagesContainer.addChild(this.bashComponent);
        this.pendingBashComponents.push(this.bashComponent);
      } else {
        this.chatContainer.addChild(this.bashComponent);
      }
      if (result.output) {
        this.bashComponent.appendOutput(result.output);
      }
      this.bashComponent.setComplete(
        result.exitCode,
        result.cancelled,
        result.truncated ? { truncated: true, content: result.output } : void 0,
        result.fullOutputPath
      );
      this.session.recordBashResult(command, result, { excludeFromContext });
      this.bashComponent = void 0;
      this.ui.requestRender();
      return;
    }
    const isDeferred = this.session.isStreaming;
    this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
    if (isDeferred) {
      this.pendingMessagesContainer.addChild(this.bashComponent);
      this.pendingBashComponents.push(this.bashComponent);
    } else {
      this.chatContainer.addChild(this.bashComponent);
    }
    this.ui.requestRender();
    try {
      const result = await this.session.executeBash(
        command,
        (chunk) => {
          if (this.bashComponent) {
            this.bashComponent.appendOutput(chunk);
            this.ui.requestRender();
          }
        },
        { excludeFromContext, operations: eventResult?.operations }
      );
      if (this.bashComponent) {
        this.bashComponent.setComplete(
          result.exitCode,
          result.cancelled,
          result.truncated ? { truncated: true, content: result.output } : void 0,
          result.fullOutputPath
        );
      }
    } catch (error) {
      if (this.bashComponent) {
        this.bashComponent.setComplete(void 0, false);
      }
      this.showError(`Bash command failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    this.bashComponent = void 0;
    this.ui.requestRender();
  }
  async handleCompactCommand(customInstructions) {
    this.clearStatusIndicator();
    try {
      await this.session.compact(customInstructions);
    } catch {
    }
  }
  stop(fullscreenExitOutput = this.settingsManager.getFullscreenExitOutput()) {
    this.disposeActiveSelector();
    if (this.settingsManager.getShowTerminalProgress()) {
      this.ui.terminal.setProgress(false);
    }
    this.clearStatusIndicator();
    this.themeController.disableAutoSync();
    this.clearExtensionTerminalInputListeners();
    this.footer.dispose();
    this.footerDataProvider.dispose();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.isInitialized) {
      this.stopInteractiveTui(fullscreenExitOutput);
      this.isInitialized = false;
    }
    this.unregisterSignalHandlers();
  }
}
export {
  InteractiveMode,
  createInteractiveTui,
  createInteractiveTuiReference,
  formatResumeCommand
};
