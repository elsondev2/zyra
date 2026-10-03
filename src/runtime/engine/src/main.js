// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { createInterface } from "node:readline";
import { modelsAreEqual } from "../../providers/src/index.js";
import chalk from "chalk";
import { normalizeSessionName, parseArgs, printHelp } from "./cli/args.js";
import {
  checkProviderAuth,
  createAuthCheckModelRuntime,
  getProviderCredential
} from "./cli/auth-check.js";
import {
  AuthCommandError,
  getAuthCommandName,
  getAuthCommandUsage,
  isAuthCommandHelp,
  parseAuthCommand,
  printAuthCommandHelp,
  validateAuthCommandArgs
} from "./cli/auth-command.js";
import { resolveCredentialForPrint } from "./cli/credential-print.js";
import { processFileArguments } from "./cli/file-processor.js";
import { buildInitialMessage } from "./cli/initial-message.js";
import { listModels } from "./cli/list-models.js";
import { createProjectTrustContext } from "./cli/project-trust.js";
import { selectSession } from "./cli/session-picker.js";
import { shouldRunFirstTimeSetup, showFirstTimeSetup, showStartupSelector } from "./cli/startup-ui.js";
import { APP_NAME, ENV_SESSION_DIR, expandTildePath, getAgentDir, getPackageDir, VERSION } from "./config.js";
import { createAgentSessionRuntime } from "./core/agent-session-runtime.js";
import {
  createAgentSessionFromServices,
  createAgentSessionServices
} from "./core/agent-session-services.js";
import { formatNoModelsAvailableMessage } from "./core/auth-guidance.js";
import { AuthStorage, ReadOnlyAuthStorage } from "./core/auth-storage.js";
import { exportFromFile } from "./core/export-html/index.js";
import { applyHttpProxySettings, configureHttpDispatcher } from "./core/http-dispatcher.js";
import { resolveCliModel, resolveModelScope } from "./core/model-resolver.js";
import { ModelRuntime } from "./core/model-runtime.js";
import { restoreStdout, takeOverStdout } from "./core/output-guard.js";
import { resolveProjectTrusted } from "./core/project-trust.js";
import {
  formatMissingSessionCwdPrompt,
  getMissingSessionCwdIssue,
  MissingSessionCwdError
} from "./core/session-cwd.js";
import { assertValidSessionId, SessionManager } from "./core/session-manager.js";
import { collectSettingsDiagnostics, deduplicateDiagnostics } from "./core/settings-diagnostics.js";
import { SettingsManager } from "./core/settings-manager.js";
import { printTimings, resetTimings, time } from "./core/timings.js";
import { hasTrustRequiringProjectResources, ProjectTrustStore } from "./core/trust-manager.js";
import { builtInExtensions } from "./extensions/index.js";
import { runMigrations, showDeprecationWarnings } from "./migrations.js";
import { InteractiveMode, runPrintMode, runRpcMode } from "./modes/index.js";
import { initTheme, stopThemeWatcher } from "./modes/interactive/theme/theme.js";
import { cleanupManagedInstall, handleConfigCommand, handlePackageCommand } from "./package-manager-cli.js";
import { isLocalPath, normalizePath, resolvePath } from "./utils/paths.js";
import { cleanupWindowsSelfUpdateQuarantine } from "./utils/windows-self-update.js";
const EXTENSION_LOAD_FAILURE_HINT = `Hint: Start without extensions using "${APP_NAME} -ne".`;
async function readPipedStdin() {
  if (process.stdin.isTTY) {
    return void 0;
  }
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data.trim() || void 0);
    });
    process.stdin.resume();
  });
}
function reportDiagnostics(diagnostics) {
  for (const diagnostic of diagnostics) {
    const color = diagnostic.type === "error" ? chalk.red : diagnostic.type === "warning" ? chalk.yellow : chalk.dim;
    const prefix = diagnostic.type === "error" ? "Error: " : diagnostic.type === "warning" ? "Warning: " : "";
    console.error(color(`${prefix}${diagnostic.message}`));
  }
}
function isTruthyEnvFlag(value) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}
function resolveAppMode(parsed, stdinIsTTY, stdoutIsTTY) {
  if (parsed.mode === "rpc") {
    return "rpc";
  }
  if (parsed.mode === "json") {
    return "json";
  }
  if (parsed.print || !stdinIsTTY || !stdoutIsTTY) {
    return "print";
  }
  return "interactive";
}
function toPrintOutputMode(appMode) {
  return appMode === "json" ? "json" : "text";
}
function isPlainRuntimeMetadataCommand(parsed) {
  return !parsed.print && parsed.mode === void 0 && (parsed.help === true || parsed.listModels !== void 0);
}
async function runAuthCommand(args) {
  if (isAuthCommandHelp(args)) {
    printAuthCommandHelp();
    return true;
  }
  let command;
  try {
    command = parseAuthCommand(args);
  } catch (error) {
    const message = error instanceof AuthCommandError ? error.message : "Failed to parse auth command";
    console.error(chalk.red(`Error: ${message}`));
    process.exitCode = 1;
    return true;
  }
  if (!command) return false;
  const parsed = parseArgs(command.args);
  if (parsed.unknownFlags.size > 0) {
    const option = parsed.unknownFlags.keys().next().value;
    console.error(chalk.red(`Unknown option --${option} for "${getAuthCommandName(command.kind)}".`));
    console.error(chalk.dim(`Use "${APP_NAME} --help" or "${getAuthCommandUsage(command.kind)}".`));
    process.exitCode = 1;
    return true;
  }
  try {
    if (parsed.diagnostics.length > 0) {
      throw new AuthCommandError(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }
    if (command.kind !== "check") {
      const signal = AbortSignal.timeout(15e3);
      const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false, signal });
      const credential2 = await resolveCredentialForPrint(
        parsed,
        modelRuntime,
        command.kind,
        command.minExpiryMs,
        signal
      );
      process.stdout.write(`${credential2}
`);
      return true;
    }
    const requestedAuth = validateAuthCommandArgs(parsed, command.kind);
    let result;
    let credential;
    try {
      const credentials = command.noRefresh ? new ReadOnlyAuthStorage() : AuthStorage.create();
      const modelRuntime = await createAuthCheckModelRuntime(credentials);
      result = await checkProviderAuth(parsed, modelRuntime, { refresh: !command.noRefresh });
      if (command.credentials && result.status === "ready") {
        credential = await getProviderCredential(result.provider, modelRuntime, credentials, {
          refresh: !command.noRefresh
        });
        if (!credential) {
          result = { status: "not_ready", provider: result.provider, reason: "credential_not_available" };
        }
      }
    } catch {
      result = {
        status: "invalid",
        provider: requestedAuth.provider ?? requestedAuth.model,
        reason: "invalid_state"
      };
    }
    const output = command.json ? JSON.stringify({ ...result, ...credential ? { credentials: credential } : {} }) : credential ?? result.status;
    process.stdout.write(`${output}
`);
    process.exitCode = result.status === "ready" ? 0 : result.status === "not_ready" ? 1 : 2;
  } catch (error) {
    const message = error instanceof AuthCommandError ? error.message : "Failed to resolve credential";
    console.error(chalk.red(`Error: ${message}`));
    process.exitCode = command.kind === "check" ? 2 : 1;
  }
  return true;
}
async function prepareInitialMessage(parsed, autoResizeImages, stdinContent) {
  if (parsed.fileArgs.length === 0) {
    return buildInitialMessage({ parsed, stdinContent });
  }
  const { text, images } = await processFileArguments(parsed.fileArgs, { autoResizeImages });
  return buildInitialMessage({
    parsed,
    fileText: text,
    fileImages: images,
    stdinContent
  });
}
async function findLocalSessionByExactId(sessionId, cwd, sessionDir) {
  const localSessions = await SessionManager.list(cwd, sessionDir);
  const localMatch = localSessions.find((s) => s.id === sessionId);
  return localMatch ? { type: "local", path: localMatch.path } : void 0;
}
async function resolveSessionPath(sessionArg, cwd, sessionDir) {
  if (sessionArg.includes("/") || sessionArg.includes("\\") || sessionArg.endsWith(".jsonl")) {
    return { type: "path", path: resolvePath(sessionArg, cwd) };
  }
  const localSessions = await SessionManager.list(cwd, sessionDir);
  const localMatch = localSessions.find((s) => s.id === sessionArg) ?? localSessions.find((s) => s.id.startsWith(sessionArg));
  if (localMatch) {
    return { type: "local", path: localMatch.path };
  }
  const allSessions = await SessionManager.listAll(sessionDir);
  const globalMatch = allSessions.find((s) => s.id === sessionArg) ?? allSessions.find((s) => s.id.startsWith(sessionArg));
  if (globalMatch) {
    return { type: "global", path: globalMatch.path, cwd: globalMatch.cwd };
  }
  return { type: "not_found", arg: sessionArg };
}
async function promptConfirm(message) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
function validateForkFlags(parsed) {
  if (!parsed.fork) return;
  const conflictingFlags = [
    parsed.session ? "--session" : void 0,
    parsed.continue ? "--continue" : void 0,
    parsed.resume ? "--resume" : void 0,
    parsed.noSession ? "--no-session" : void 0
  ].filter((flag) => flag !== void 0);
  if (conflictingFlags.length > 0) {
    console.error(chalk.red(`Error: --fork cannot be combined with ${conflictingFlags.join(", ")}`));
    process.exit(1);
  }
}
function validateSessionIdFlags(parsed) {
  if (parsed.sessionId === void 0) return;
  const conflictingFlags = [
    parsed.session ? "--session" : void 0,
    parsed.continue ? "--continue" : void 0,
    parsed.resume ? "--resume" : void 0
  ].filter((flag) => flag !== void 0);
  if (conflictingFlags.length > 0) {
    console.error(chalk.red(`Error: --session-id cannot be combined with ${conflictingFlags.join(", ")}`));
    process.exit(1);
  }
  try {
    assertValidSessionId(parsed.sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
function openSessionOrExit(path, sessionDir) {
  try {
    return SessionManager.open(path, sessionDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
function forkSessionOrExit(sourcePath, cwd, sessionDir, sessionId) {
  try {
    return SessionManager.forkFrom(sourcePath, cwd, sessionDir, { id: sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
async function createSessionManager(parsed, cwd, sessionDir, settingsManager) {
  if (parsed.noSession || parsed.help || parsed.listModels !== void 0) {
    return SessionManager.inMemory(cwd, parsed.sessionId !== void 0 ? { id: parsed.sessionId } : void 0);
  }
  if (parsed.fork) {
    if (parsed.sessionId) {
      const existingTarget = await findLocalSessionByExactId(parsed.sessionId, cwd, sessionDir);
      if (existingTarget) {
        console.error(chalk.red(`Session already exists with id '${parsed.sessionId}'`));
        process.exit(1);
      }
    }
    const resolved = await resolveSessionPath(parsed.fork, cwd, sessionDir);
    switch (resolved.type) {
      case "path":
      case "local":
      case "global":
        return forkSessionOrExit(resolved.path, cwd, sessionDir, parsed.sessionId);
      case "not_found":
        console.error(chalk.red(`No session found matching '${resolved.arg}'`));
        process.exit(1);
    }
  }
  if (parsed.session) {
    const resolved = await resolveSessionPath(parsed.session, cwd, sessionDir);
    switch (resolved.type) {
      case "path":
      case "local":
        return openSessionOrExit(resolved.path, sessionDir);
      case "global": {
        console.log(chalk.yellow(`Session found in different project: ${resolved.cwd}`));
        const shouldFork = await promptConfirm("Fork this session into current directory?");
        if (!shouldFork) {
          console.log(chalk.dim("Aborted."));
          process.exit(0);
        }
        return forkSessionOrExit(resolved.path, cwd, sessionDir);
      }
      case "not_found":
        console.error(chalk.red(`No session found matching '${resolved.arg}'`));
        process.exit(1);
    }
  }
  if (parsed.resume) {
    try {
      const selectedPath = await selectSession(
        (onProgress) => SessionManager.list(cwd, sessionDir, onProgress),
        (onProgress) => SessionManager.listAll(sessionDir, onProgress),
        settingsManager
      );
      if (!selectedPath) {
        console.log(chalk.dim("No session selected"));
        process.exit(0);
      }
      return SessionManager.open(selectedPath, sessionDir);
    } finally {
      stopThemeWatcher();
    }
  }
  if (parsed.continue) {
    return SessionManager.continueRecent(cwd, sessionDir);
  }
  if (parsed.sessionId) {
    const existingSession = await findLocalSessionByExactId(parsed.sessionId, cwd, sessionDir);
    if (existingSession) {
      return SessionManager.open(existingSession.path, sessionDir);
    }
    console.error(
      chalk.yellow(
        `Warning: No project session found with id '${parsed.sessionId}'; creating a new session with that id.`
      )
    );
  }
  return SessionManager.create(cwd, sessionDir, { id: parsed.sessionId });
}
function buildSessionOptions(parsed, scopedModels, hasExistingSession, modelRuntime, settingsManager) {
  const options = {};
  const diagnostics = [];
  let cliThinkingFromModel = false;
  if (parsed.model) {
    const resolved = resolveCliModel({
      cliProvider: parsed.provider,
      cliModel: parsed.model,
      cliThinking: parsed.thinking,
      modelRuntime
    });
    if (resolved.warning) {
      diagnostics.push({ type: "warning", message: resolved.warning });
    }
    if (resolved.error) {
      diagnostics.push({ type: "error", message: resolved.error });
    }
    if (resolved.model) {
      options.model = resolved.model;
      if (!parsed.thinking && resolved.thinkingLevel) {
        options.thinkingLevel = resolved.thinkingLevel;
        cliThinkingFromModel = true;
      }
    }
  }
  if (!options.model && scopedModels.length > 0 && !hasExistingSession) {
    const savedProvider = settingsManager.getDefaultProvider();
    const savedModelId = settingsManager.getDefaultModel();
    const savedModel = savedProvider && savedModelId ? modelRuntime.getModel(savedProvider, savedModelId) : void 0;
    const savedInScope = savedModel ? scopedModels.find((sm) => modelsAreEqual(sm.model, savedModel)) : void 0;
    if (savedInScope) {
      options.model = savedInScope.model;
      if (!parsed.thinking && savedInScope.thinkingLevel) {
        options.thinkingLevel = savedInScope.thinkingLevel;
      }
    } else {
      options.model = scopedModels[0].model;
      if (!parsed.thinking && scopedModels[0].thinkingLevel) {
        options.thinkingLevel = scopedModels[0].thinkingLevel;
      }
    }
  }
  if (parsed.thinking) {
    options.thinkingLevel = parsed.thinking;
  }
  if (scopedModels.length > 0) {
    options.scopedModels = scopedModels.map((sm) => ({
      model: sm.model,
      thinkingLevel: sm.thinkingLevel
    }));
  }
  if (parsed.noTools) {
    options.noTools = "all";
  } else if (parsed.noBuiltinTools) {
    options.noTools = "builtin";
  }
  if (parsed.tools) {
    options.tools = [...parsed.tools];
  }
  if (parsed.excludeTools) {
    options.excludeTools = [...parsed.excludeTools];
  }
  return { options, cliThinkingFromModel, diagnostics };
}
function resolveCliPaths(cwd, paths) {
  return paths?.map((value) => isLocalPath(value) ? resolvePath(value, cwd) : value);
}
async function promptForMissingSessionCwd(issue, settingsManager) {
  return showStartupSelector(settingsManager, formatMissingSessionCwdPrompt(issue), [
    { label: "Continue", value: issue.fallbackCwd },
    { label: "Cancel", value: void 0 }
  ]);
}
async function main(args, options) {
  resetTimings();
  const extensionFactories = [...builtInExtensions, ...options?.extensionFactories ?? []];
  const offlineMode = args.includes("--offline") || isTruthyEnvFlag(process.env.ZYRA_OFFLINE);
  if (offlineMode) {
    process.env.ZYRA_OFFLINE = "1";
    process.env.ZYRA_SKIP_VERSION_CHECK = "1";
  }
  if (await runAuthCommand(args)) {
    return;
  }
  if (process.platform === "win32") {
    cleanupWindowsSelfUpdateQuarantine(getPackageDir());
  }
  cleanupManagedInstall();
  const cwd = process.cwd();
  const agentDir = getAgentDir();
  const bootstrapSettingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
  applyHttpProxySettings(bootstrapSettingsManager.getGlobalSettings().httpProxy);
  configureHttpDispatcher();
  if (await handlePackageCommand(args, { extensionFactories })) {
    const exitCode = process.exitCode ?? 0;
    if (process.platform === "win32" && exitCode === 0 && args[0] === "update") {
      return;
    }
    process.exit(exitCode);
    return;
  }
  if (await handleConfigCommand(args, { extensionFactories })) {
    return;
  }
  const parsed = parseArgs(args);
  if (parsed.diagnostics.length > 0) {
    for (const d of parsed.diagnostics) {
      const color = d.type === "error" ? chalk.red : chalk.yellow;
      console.error(color(`${d.type === "error" ? "Error" : "Warning"}: ${d.message}`));
    }
    if (parsed.diagnostics.some((d) => d.type === "error")) {
      process.exit(1);
    }
  }
  time("parseArgs");
  if (parsed.version) {
    console.log(VERSION);
    process.exit(0);
  }
  if (parsed.export) {
    let result;
    try {
      const outputPath = parsed.messages.length > 0 ? parsed.messages[0] : void 0;
      result = await exportFromFile(parsed.export, outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export session";
      console.error(chalk.red(`Error: ${message}`));
      process.exit(1);
    }
    console.log(`Exported to: ${result}`);
    process.exit(0);
  }
  let appMode = resolveAppMode(parsed, process.stdin.isTTY, process.stdout.isTTY);
  const shouldTakeOverStdout = appMode !== "interactive" && !isPlainRuntimeMetadataCommand(parsed);
  if (shouldTakeOverStdout) {
    takeOverStdout();
  }
  if (parsed.mode === "rpc" && parsed.fileArgs.length > 0) {
    console.error(chalk.red("Error: @file arguments are not supported in RPC mode"));
    process.exit(1);
  }
  validateForkFlags(parsed);
  validateSessionIdFlags(parsed);
  const { migratedAuthProviders: migratedProviders, deprecationWarnings } = runMigrations(cwd);
  time("runMigrations");
  const startupSettingsManager = SettingsManager.create(cwd, agentDir);
  const startupSettingsDiagnostics = collectSettingsDiagnostics(startupSettingsManager);
  if (appMode === "interactive" && !parsed.help && parsed.listModels === void 0 && shouldRunFirstTimeSetup()) {
    await showFirstTimeSetup(startupSettingsManager);
    time("firstTimeSetup");
  }
  if (appMode === "interactive" && parsed.useTheme !== void 0) {
    startupSettingsManager.applyOverrides({ theme: parsed.useTheme });
  }
  const envSessionDir = process.env[ENV_SESSION_DIR];
  const sessionDir = (parsed.sessionDir ? normalizePath(parsed.sessionDir) : void 0) ?? (envSessionDir ? expandTildePath(envSessionDir) : void 0) ?? startupSettingsManager.getSessionDir();
  let sessionManager = await createSessionManager(parsed, cwd, sessionDir, startupSettingsManager);
  const missingSessionCwdIssue = getMissingSessionCwdIssue(sessionManager, cwd);
  if (missingSessionCwdIssue) {
    if (appMode === "interactive") {
      const selectedCwd = await promptForMissingSessionCwd(missingSessionCwdIssue, startupSettingsManager);
      if (!selectedCwd) {
        process.exit(0);
      }
      sessionManager = SessionManager.open(missingSessionCwdIssue.sessionFile, sessionDir, selectedCwd);
    } else {
      console.error(chalk.red(new MissingSessionCwdError(missingSessionCwdIssue).message));
      process.exit(1);
    }
  }
  if (parsed.name !== void 0) {
    const name = normalizeSessionName(parsed.name);
    if (name === void 0) {
      console.error(chalk.red("Error: --name requires a non-empty value"));
      process.exit(1);
    }
    sessionManager.appendSessionInfo(name);
  }
  time("createSessionManager");
  const trustStore = new ProjectTrustStore(agentDir);
  const sessionCwd = sessionManager.getCwd();
  const autoTrustOnReloadCwd = parsed.projectTrustOverride === void 0 && !hasTrustRequiringProjectResources(sessionCwd) ? sessionCwd : void 0;
  const trustPromptMode = parsed.help || parsed.listModels !== void 0 ? "print" : appMode;
  const projectTrustByCwd = /* @__PURE__ */ new Map();
  const resolvedExtensionPaths = resolveCliPaths(cwd, parsed.extensions);
  const resolvedSkillPaths = resolveCliPaths(cwd, parsed.skills);
  const resolvedPromptTemplatePaths = resolveCliPaths(cwd, parsed.promptTemplates);
  const resolvedThemePaths = resolveCliPaths(cwd, parsed.themes);
  const createRuntime = async ({
    cwd: cwd2,
    agentDir: agentDir2,
    sessionManager: sessionManager2,
    sessionStartEvent,
    projectTrustContext
  }) => {
    const isInitialRuntime = sessionStartEvent === void 0;
    const projectTrustDiagnostics = [];
    const cachedProjectTrust = projectTrustByCwd.get(cwd2);
    const hasTrustRequiringResources = hasTrustRequiringProjectResources(cwd2);
    const shouldResolveProjectTrust = parsed.projectTrustOverride === void 0 && cachedProjectTrust === void 0 && hasTrustRequiringResources;
    const projectTrusted = shouldResolveProjectTrust ? false : cachedProjectTrust ?? parsed.projectTrustOverride ?? (!hasTrustRequiringResources || trustStore.get(cwd2) === true);
    const runtimeSettingsManager = SettingsManager.create(cwd2, agentDir2, { projectTrusted });
    const services2 = await createAgentSessionServices({
      cwd: cwd2,
      agentDir: agentDir2,
      settingsManager: runtimeSettingsManager,
      modelRuntimeSignal: AbortSignal.timeout(15e3),
      extensionFlagValues: parsed.unknownFlags,
      resourceLoaderReloadOptions: shouldResolveProjectTrust ? {
        resolveProjectTrust: async ({ extensionsResult }) => {
          const trusted = await resolveProjectTrusted({
            cwd: cwd2,
            trustStore,
            trustOverride: parsed.projectTrustOverride,
            defaultProjectTrust: startupSettingsManager.getDefaultProjectTrust(),
            extensionsResult,
            projectTrustContext: projectTrustContext ?? createProjectTrustContext({
              cwd: cwd2,
              mode: isInitialRuntime ? trustPromptMode : appMode,
              settingsManager: startupSettingsManager,
              hasUI: isInitialRuntime && trustPromptMode === "interactive"
            }),
            onExtensionError: (message) => projectTrustDiagnostics.push({ type: "warning", message })
          });
          projectTrustByCwd.set(cwd2, trusted);
          return trusted;
        }
      } : void 0,
      resourceLoaderOptions: {
        additionalExtensionPaths: resolvedExtensionPaths,
        additionalSkillPaths: resolvedSkillPaths,
        additionalPromptTemplatePaths: resolvedPromptTemplatePaths,
        additionalThemePaths: resolvedThemePaths,
        noExtensions: parsed.noExtensions,
        noSkills: parsed.noSkills,
        noPromptTemplates: parsed.noPromptTemplates,
        noThemes: parsed.noThemes,
        noContextFiles: parsed.noContextFiles,
        systemPrompt: parsed.systemPrompt,
        appendSystemPrompt: parsed.appendSystemPrompt,
        extensionFactories
      }
    });
    const { settingsManager: settingsManager2, modelRuntime: modelRuntime2, resourceLoader: resourceLoader2 } = services2;
    const diagnostics = [
      ...projectTrustDiagnostics,
      ...services2.diagnostics,
      ...collectSettingsDiagnostics(settingsManager2),
      ...resourceLoader2.getExtensions().errors.map(({ path, error }) => ({
        type: "error",
        message: `Failed to load extension "${path}": ${error}`
      }))
    ];
    const modelPatterns = parsed.models ?? settingsManager2.getEnabledModels();
    const scopedModels = modelPatterns && modelPatterns.length > 0 ? await resolveModelScope(modelPatterns, modelRuntime2, { signal: AbortSignal.timeout(15e3) }) : [];
    const {
      options: sessionOptions,
      cliThinkingFromModel,
      diagnostics: sessionOptionDiagnostics
    } = buildSessionOptions(
      parsed,
      scopedModels,
      sessionManager2.buildSessionContext().messages.length > 0,
      modelRuntime2,
      settingsManager2
    );
    diagnostics.push(...sessionOptionDiagnostics);
    if (parsed.apiKey) {
      if (!sessionOptions.model) {
        diagnostics.push({
          type: "error",
          message: "--api-key requires a model to be specified via --model, --provider/--model, or --models"
        });
      } else {
        await modelRuntime2.setRuntimeApiKey(sessionOptions.model.provider, parsed.apiKey);
      }
    }
    const created = await createAgentSessionFromServices({
      services: services2,
      sessionManager: sessionManager2,
      sessionStartEvent,
      model: sessionOptions.model,
      thinkingLevel: sessionOptions.thinkingLevel,
      scopedModels: sessionOptions.scopedModels,
      tools: sessionOptions.tools,
      excludeTools: sessionOptions.excludeTools,
      noTools: sessionOptions.noTools,
      customTools: sessionOptions.customTools
    });
    const cliThinkingOverride = parsed.thinking !== void 0 || cliThinkingFromModel;
    if (created.session.model && cliThinkingOverride) {
      created.session.setThinkingLevel(created.session.thinkingLevel);
    }
    return {
      ...created,
      services: services2,
      diagnostics
    };
  };
  time("createRuntime");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: sessionManager.getCwd(),
    agentDir,
    sessionManager
  });
  time("createAgentSessionRuntime");
  const { services, session, modelFallbackMessage } = runtime;
  const { settingsManager, modelRuntime, resourceLoader } = services;
  applyHttpProxySettings(settingsManager.getGlobalSettings().httpProxy);
  configureHttpDispatcher(settingsManager.getHttpIdleTimeoutMs());
  if (parsed.help) {
    reportDiagnostics(startupSettingsDiagnostics);
    const extensionFlags = resourceLoader.getExtensions().extensions.flatMap((extension) => Array.from(extension.flags.values()));
    printHelp(extensionFlags);
    process.exit(0);
  }
  if (parsed.listModels !== void 0) {
    reportDiagnostics(startupSettingsDiagnostics);
    const searchPattern = typeof parsed.listModels === "string" ? parsed.listModels : void 0;
    await listModels(modelRuntime, searchPattern, AbortSignal.timeout(15e3));
    process.exit(0);
  }
  let stdinContent;
  if (appMode !== "rpc") {
    stdinContent = await readPipedStdin();
    if (stdinContent !== void 0 && appMode === "interactive") {
      appMode = "print";
    }
  }
  time("readPipedStdin");
  const { initialMessage, initialImages } = await prepareInitialMessage(
    parsed,
    settingsManager.getImageAutoResize(),
    stdinContent
  );
  time("prepareInitialMessage");
  initTheme(settingsManager.getTheme(), appMode === "interactive");
  time("initTheme");
  if (appMode === "interactive" && deprecationWarnings.length > 0) {
    await showDeprecationWarnings(deprecationWarnings);
  }
  time("resolveModelScope");
  const startupDiagnostics = deduplicateDiagnostics([...startupSettingsDiagnostics, ...runtime.diagnostics]);
  const hasRuntimeErrors = runtime.diagnostics.some((diagnostic) => diagnostic.type === "error");
  if (appMode !== "interactive" || hasRuntimeErrors) {
    reportDiagnostics(startupDiagnostics);
  }
  if (hasRuntimeErrors) {
    if (runtime.diagnostics.some((diagnostic) => diagnostic.message.includes("Failed to load extension"))) {
      console.error(chalk.yellow(EXTENSION_LOAD_FAILURE_HINT));
    }
    process.exit(1);
  }
  time("createAgentSession");
  if (appMode !== "interactive" && !session.model) {
    console.error(chalk.red(formatNoModelsAvailableMessage()));
    process.exit(1);
  }
  const startupBenchmark = isTruthyEnvFlag(process.env.ZYRA_STARTUP_BENCHMARK);
  if (startupBenchmark && appMode !== "interactive") {
    console.error(chalk.red("Error: ZYRA_STARTUP_BENCHMARK only supports interactive mode"));
    process.exit(1);
  }
  if (!offlineMode && appMode === "rpc") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    void modelRuntime.refresh({ signal: controller.signal }).catch(() => {
    }).finally(() => clearTimeout(timeout));
  }
  if (appMode === "rpc") {
    printTimings();
    await runRpcMode(runtime);
  } else if (appMode === "interactive") {
    const interactiveMode = new InteractiveMode(runtime, {
      migratedProviders,
      startupDiagnostics,
      modelFallbackMessage,
      autoTrustOnReloadCwd,
      initialMessage,
      initialImages,
      initialMessages: parsed.messages,
      verbose: parsed.verbose,
      tuiMode: parsed.tuiMode,
      initialThemeSetting: parsed.useTheme
    });
    if (startupBenchmark) {
      await interactiveMode.init();
      time("interactiveMode.init");
      await new Promise((resolve) => setTimeout(resolve, 150));
      interactiveMode.stop();
      stopThemeWatcher();
      printTimings();
      if (process.stdout.writableLength > 0) {
        await new Promise((resolve) => process.stdout.once("drain", resolve));
      }
      if (process.stderr.writableLength > 0) {
        await new Promise((resolve) => process.stderr.once("drain", resolve));
      }
      return;
    }
    printTimings();
    await interactiveMode.run();
  } else {
    printTimings();
    const exitCode = await runPrintMode(runtime, {
      mode: toPrintOutputMode(appMode),
      messages: parsed.messages,
      initialMessage,
      initialImages
    });
    stopThemeWatcher();
    restoreStdout();
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
    return;
  }
}
export {
  createSessionManager,
  main
};
