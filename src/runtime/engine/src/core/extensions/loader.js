// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR_NAME, getAgentDir, isBunBinary } from "../../config.js";
import { resolvePath } from "../../utils/paths.js";
import { createEventBus } from "../event-bus.js";
import { execCommand } from "../exec.js";
import { readPiManifest } from "../pi-manifest.js";
import { createSyntheticSourceInfo } from "../source-info.js";
import { time } from "../timings.js";
const require2 = createRequire(import.meta.url);
const isNodeSeaBinary = "sea" in process.features && process.features.sea === true || process.getBuiltinModule("node:sea")?.isSea() === true;
const isBundledNode = typeof ZYRA_BUNDLED_NODE !== "undefined" && ZYRA_BUNDLED_NODE;
const isTypeScriptSourceRuntime = !isBunBinary && path.extname(fileURLToPath(import.meta.url)) === ".ts";
let _aliases = null;
function getAliases() {
  if (_aliases) return _aliases;
  _aliases = {
    "@zyra/engine": fileURLToPath(new URL("../../index.js", import.meta.url)),
    "@zyra/agent": fileURLToPath(new URL("../../../../agent/src/index.js", import.meta.url)),
    "@zyra/terminal": fileURLToPath(new URL("../../../../terminal/src/index.js", import.meta.url)),
    "@zyra/providers": fileURLToPath(new URL("../../../../providers/src/compat.js", import.meta.url)),
    "@zyra/providers/compat": fileURLToPath(new URL("../../../../providers/src/compat.js", import.meta.url)),
    "@zyra/providers/oauth": fileURLToPath(new URL("../../../../providers/src/oauth.js", import.meta.url)),
    "@zyra/providers/providers/all": fileURLToPath(new URL("../../../../providers/src/providers/all.js", import.meta.url)),
    typebox: require2.resolve("typebox"),
    "typebox/compile": require2.resolve("typebox/compile"),
    "typebox/value": require2.resolve("typebox/value"),
    "@sinclair/typebox": require2.resolve("typebox"),
    "@sinclair/typebox/compile": require2.resolve("typebox/compile"),
    "@sinclair/typebox/value": require2.resolve("typebox/value")
  };
  const legacy = { "@earendil-works/pi-coding-agent": "@zyra/engine", "@mariozechner/pi-coding-agent": "@zyra/engine", "@earendil-works/pi-agent-core": "@zyra/agent", "@mariozechner/pi-agent-core": "@zyra/agent", "@earendil-works/pi-tui": "@zyra/terminal", "@mariozechner/pi-tui": "@zyra/terminal", "@earendil-works/pi-ai": "@zyra/providers", "@mariozechner/pi-ai": "@zyra/providers", "@earendil-works/pi-ai/compat": "@zyra/providers/compat", "@mariozechner/pi-ai/compat": "@zyra/providers/compat", "@earendil-works/pi-ai/oauth": "@zyra/providers/oauth", "@mariozechner/pi-ai/oauth": "@zyra/providers/oauth", "@earendil-works/pi-ai/providers/all": "@zyra/providers/providers/all", "@mariozechner/pi-ai/providers/all": "@zyra/providers/providers/all" };
  for (const [alias, own] of Object.entries(legacy)) _aliases[alias] = _aliases[own];
  return _aliases;
}
let extensionCacheCwd;
let extensionCacheGeneration = 0;
const extensionCache = /* @__PURE__ */ new Map();
function clearExtensionCache() {
  extensionCache.clear();
  extensionCacheCwd = void 0;
  extensionCacheGeneration++;
}
function useExtensionCacheCwd(cwd) {
  const resolvedCwd = resolvePath(cwd);
  if (extensionCacheCwd !== void 0 && extensionCacheCwd !== resolvedCwd) {
    clearExtensionCache();
  }
  extensionCacheCwd = resolvedCwd;
  return { cwd: resolvedCwd, generation: extensionCacheGeneration };
}
function createExtensionRuntime() {
  const notInitialized = () => {
    throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
  };
  const state = {};
  const eventBusUnsubscribers = /* @__PURE__ */ new Set();
  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };
  const runtime = {
    sendMessage: notInitialized,
    sendUserMessage: notInitialized,
    appendEntry: notInitialized,
    setSessionName: notInitialized,
    getSessionName: notInitialized,
    setLabel: notInitialized,
    getActiveTools: notInitialized,
    getAllTools: notInitialized,
    setActiveTools: notInitialized,
    // registerTool() is valid during extension load; refresh is only needed post-bind.
    refreshTools: () => {
    },
    getCommands: notInitialized,
    setModel: () => Promise.reject(new Error("Extension runtime not initialized")),
    getThinkingLevel: notInitialized,
    setThinkingLevel: notInitialized,
    flagValues: /* @__PURE__ */ new Map(),
    pendingProviderRegistrations: [],
    pendingNativeProviderRegistrations: [],
    assertActive,
    invalidate: (message) => {
      if (state.staleMessage) return;
      state.staleMessage = message ?? "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
      for (const unsubscribe of eventBusUnsubscribers) unsubscribe();
      eventBusUnsubscribers.clear();
    },
    trackEventBusSubscription: (unsubscribe) => {
      let active = true;
      const trackedUnsubscribe = () => {
        if (!active) return;
        active = false;
        eventBusUnsubscribers.delete(trackedUnsubscribe);
        unsubscribe();
      };
      eventBusUnsubscribers.add(trackedUnsubscribe);
      return trackedUnsubscribe;
    },
    // Pre-bind: queue registrations so bindCore() can flush them once the
    // model registry is available. bindCore() replaces both with direct calls.
    registerProvider: (name, config, extensionPath = "<unknown>") => {
      runtime.pendingProviderRegistrations.push({ name, config, extensionPath });
    },
    registerNativeProvider: (provider, extensionPath = "<unknown>") => {
      runtime.pendingNativeProviderRegistrations.push({ provider, extensionPath });
    },
    unregisterProvider: (name) => {
      runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter((r) => r.name !== name);
      runtime.pendingNativeProviderRegistrations = runtime.pendingNativeProviderRegistrations.filter(
        (r) => r.provider.id !== name
      );
    }
  };
  return runtime;
}
function createExtensionAPI(extension, runtime, cwd, eventBus) {
  const pendingFlagValues = /* @__PURE__ */ new Map();
  const pendingRuntimeChanges = [];
  const loadingUnsubscribers = [];
  let state = "loading";
  const assertActive = () => {
    if (state === "failed") {
      throw new Error(`Extension "${extension.path}" failed to load and its API is no longer active.`);
    }
    runtime.assertActive();
  };
  const applyRuntimeChange = (change) => {
    if (state === "loading") pendingRuntimeChanges.push(change);
    else change();
  };
  const clearPending = () => {
    pendingFlagValues.clear();
    pendingRuntimeChanges.length = 0;
    loadingUnsubscribers.length = 0;
  };
  const api = {
    // Registration methods - write to extension
    on(event, handler) {
      assertActive();
      const list = extension.handlers.get(event) ?? [];
      list.push(handler);
      extension.handlers.set(event, list);
    },
    registerTool(tool) {
      assertActive();
      extension.tools.set(tool.name, {
        definition: tool,
        sourceInfo: extension.sourceInfo
      });
      runtime.refreshTools();
    },
    registerCommand(name, options) {
      assertActive();
      extension.commands.set(name, {
        name,
        sourceInfo: extension.sourceInfo,
        ...options
      });
    },
    registerShortcut(shortcut, options) {
      assertActive();
      extension.shortcuts.set(shortcut, { shortcut, extensionPath: extension.path, ...options });
    },
    registerFlag(name, options) {
      assertActive();
      if (options.default !== void 0 && typeof options.default !== options.type) {
        throw new Error(
          `Invalid default for flag "${name}": expected ${options.type}, got ${typeof options.default}`
        );
      }
      extension.flags.set(name, { name, extensionPath: extension.path, ...options });
      if (options.default !== void 0 && !runtime.flagValues.has(name)) {
        if (state === "loading") {
          if (!pendingFlagValues.has(name)) pendingFlagValues.set(name, options.default);
        } else {
          runtime.flagValues.set(name, options.default);
        }
      }
    },
    registerMessageRenderer(customType, renderer) {
      assertActive();
      extension.messageRenderers.set(customType, renderer);
    },
    registerMarkdownTransformer(transformer) {
      assertActive();
      extension.markdownTransformer = transformer;
    },
    registerEntryRenderer(customType, renderer) {
      assertActive();
      extension.entryRenderers ??= /* @__PURE__ */ new Map();
      extension.entryRenderers.set(customType, renderer);
    },
    // Flag access - checks extension registered it, reads from runtime
    getFlag(name) {
      assertActive();
      if (!extension.flags.has(name)) return void 0;
      return runtime.flagValues.has(name) ? runtime.flagValues.get(name) : pendingFlagValues.get(name);
    },
    // Action methods - delegate to shared runtime
    sendMessage(message, options) {
      assertActive();
      runtime.sendMessage(message, options);
    },
    sendUserMessage(content, options) {
      assertActive();
      runtime.sendUserMessage(content, options);
    },
    appendEntry(customType, data) {
      assertActive();
      runtime.appendEntry(customType, data);
    },
    setSessionName(name) {
      assertActive();
      runtime.setSessionName(name);
    },
    getSessionName() {
      assertActive();
      return runtime.getSessionName();
    },
    setLabel(entryId, label) {
      assertActive();
      runtime.setLabel(entryId, label);
    },
    exec(command, args, options) {
      assertActive();
      return execCommand(command, args, options?.cwd ?? cwd, options);
    },
    getActiveTools() {
      assertActive();
      return runtime.getActiveTools();
    },
    getAllTools() {
      assertActive();
      return runtime.getAllTools();
    },
    setActiveTools(toolNames) {
      assertActive();
      runtime.setActiveTools(toolNames);
    },
    getCommands() {
      assertActive();
      return runtime.getCommands();
    },
    setModel(model) {
      assertActive();
      return runtime.setModel(model);
    },
    getThinkingLevel() {
      assertActive();
      return runtime.getThinkingLevel();
    },
    setThinkingLevel(level) {
      assertActive();
      runtime.setThinkingLevel(level);
    },
    registerProvider(providerOrName, config) {
      assertActive();
      if (typeof providerOrName === "string") {
        if (!config) throw new Error("Provider config is required when registering by name");
        applyRuntimeChange(() => runtime.registerProvider(providerOrName, config, extension.path));
        return;
      }
      applyRuntimeChange(() => runtime.registerNativeProvider(providerOrName, extension.path));
    },
    unregisterProvider(name) {
      assertActive();
      applyRuntimeChange(() => runtime.unregisterProvider(name, extension.path));
    },
    events: {
      emit(channel, data) {
        assertActive();
        eventBus.emit(channel, data);
      },
      on(channel, handler) {
        assertActive();
        const unsubscribe = runtime.trackEventBusSubscription(eventBus.on(channel, handler));
        if (state === "loading") loadingUnsubscribers.push(unsubscribe);
        return unsubscribe;
      }
    }
  };
  return {
    api,
    commit: () => {
      if (state !== "loading") return;
      runtime.assertActive();
      for (const [name, value] of pendingFlagValues) {
        if (!runtime.flagValues.has(name)) runtime.flagValues.set(name, value);
      }
      for (const apply of pendingRuntimeChanges) apply();
      state = "active";
      clearPending();
    },
    discard: () => {
      if (state !== "loading") return;
      state = "failed";
      for (const unsubscribe of loadingUnsubscribers) unsubscribe();
      clearPending();
    }
  };
}
function isCurrentCacheToken(cacheToken) {
  return cacheToken !== void 0 && extensionCacheCwd === cacheToken.cwd && extensionCacheGeneration === cacheToken.generation;
}
async function loadExtensionModule(extensionPath, cacheToken) {
  if (isCurrentCacheToken(cacheToken)) {
    const cachedFactory = extensionCache.get(extensionPath);
    if (cachedFactory) {
      return cachedFactory;
    }
  }
  const virtualModules = isBunBinary || isNodeSeaBinary || isBundledNode || isTypeScriptSourceRuntime ? (await import("./virtual-modules.js")).VIRTUAL_MODULES : void 0;
  const { createJiti } = await import("jiti/static");
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    // Compiled binaries and the bundled Node distribution use embedded modules.
    // Source TypeScript reuses host modules and root tsconfig paths. Unbundled
    // Node builds use dist aliases.
    ...isBunBinary || isNodeSeaBinary || isBundledNode ? { virtualModules, tryNative: false } : isTypeScriptSourceRuntime ? { virtualModules, tsconfigPaths: true } : { alias: getAliases() }
  });
  const module = await jiti.import(extensionPath, { default: true });
  const factory = module;
  if (typeof factory !== "function") {
    return void 0;
  }
  if (isCurrentCacheToken(cacheToken)) {
    extensionCache.set(extensionPath, factory);
  }
  return factory;
}
function createExtension(extensionPath, resolvedPath) {
  const source = extensionPath.startsWith("<") && extensionPath.endsWith(">") ? extensionPath.slice(1, -1).split(":")[0] || "temporary" : "local";
  const baseDir = extensionPath.startsWith("<") ? void 0 : path.dirname(resolvedPath);
  return {
    path: extensionPath,
    resolvedPath,
    sourceInfo: createSyntheticSourceInfo(extensionPath, { source, baseDir }),
    handlers: /* @__PURE__ */ new Map(),
    tools: /* @__PURE__ */ new Map(),
    messageRenderers: /* @__PURE__ */ new Map(),
    entryRenderers: /* @__PURE__ */ new Map(),
    commands: /* @__PURE__ */ new Map(),
    flags: /* @__PURE__ */ new Map(),
    shortcuts: /* @__PURE__ */ new Map()
  };
}
async function initializeExtension(factory, extensionPath, resolvedPath, cwd, eventBus, runtime) {
  const extension = createExtension(extensionPath, resolvedPath);
  const load = createExtensionAPI(extension, runtime, cwd, eventBus);
  try {
    await factory(load.api);
    load.commit();
  } catch (error) {
    load.discard();
    throw error;
  }
  time(`${extensionPath} factory`, "extensions");
  return extension;
}
async function loadExtension(extensionPath, cwd, eventBus, runtime, cacheToken) {
  const resolvedPath = resolvePath(extensionPath, cwd, { normalizeUnicodeSpaces: true });
  try {
    const factory = await loadExtensionModule(resolvedPath, cacheToken);
    time(`${extensionPath} module import`, "extensions");
    if (!factory) {
      return { extension: null, error: `Extension does not export a valid factory function: ${extensionPath}` };
    }
    const extension = await initializeExtension(factory, extensionPath, resolvedPath, cwd, eventBus, runtime);
    return { extension, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { extension: null, error: `Failed to load extension: ${message}` };
  }
}
async function loadExtensionFromFactory(factory, cwd, eventBus, runtime, extensionPath = "<inline>") {
  const resolvedCwd = resolvePath(cwd);
  return initializeExtension(factory, extensionPath, extensionPath, resolvedCwd, eventBus, runtime);
}
async function loadExtensionsInternal(paths, cwd, eventBus, runtime, useCache = false) {
  const extensions = [];
  const errors = [];
  const cacheToken = useCache ? useExtensionCacheCwd(cwd) : void 0;
  const resolvedCwd = cacheToken?.cwd ?? resolvePath(cwd);
  const resolvedEventBus = eventBus ?? createEventBus();
  const resolvedRuntime = runtime ?? createExtensionRuntime();
  for (const extPath of paths) {
    const { extension, error } = await loadExtension(
      extPath,
      resolvedCwd,
      resolvedEventBus,
      resolvedRuntime,
      cacheToken
    );
    if (error) {
      errors.push({ path: extPath, error });
      continue;
    }
    if (extension) {
      extensions.push(extension);
    }
  }
  return {
    extensions,
    errors,
    runtime: resolvedRuntime
  };
}
async function loadExtensions(paths, cwd, eventBus, runtime) {
  return loadExtensionsInternal(paths, cwd, eventBus, runtime);
}
async function loadExtensionsCached(paths, cwd, eventBus, runtime) {
  return loadExtensionsInternal(paths, cwd, eventBus, runtime, true);
}
function isExtensionFile(name) {
  return name.endsWith(".ts") || name.endsWith(".js");
}
function resolveExtensionEntries(dir) {
  const packageJsonPath = path.join(dir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const manifest = readPiManifest(packageJsonPath);
    if (manifest?.extensions?.length) {
      const entries = [];
      for (const extPath of manifest.extensions) {
        const resolvedExtPath = path.resolve(dir, extPath);
        if (fs.existsSync(resolvedExtPath)) {
          entries.push(resolvedExtPath);
        }
      }
      if (entries.length > 0) {
        return entries;
      }
    }
  }
  const indexTs = path.join(dir, "index.ts");
  const indexJs = path.join(dir, "index.js");
  if (fs.existsSync(indexTs)) {
    return [indexTs];
  }
  if (fs.existsSync(indexJs)) {
    return [indexJs];
  }
  return null;
}
function discoverExtensionsInDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const discovered = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if ((entry.isFile() || entry.isSymbolicLink()) && isExtensionFile(entry.name)) {
        discovered.push(entryPath);
        continue;
      }
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const entries2 = resolveExtensionEntries(entryPath);
        if (entries2) {
          discovered.push(...entries2);
        }
      }
    }
  } catch {
    return [];
  }
  return discovered;
}
async function discoverAndLoadExtensions(configuredPaths, cwd, agentDir = getAgentDir(), eventBus) {
  const resolvedCwd = resolvePath(cwd);
  const resolvedAgentDir = resolvePath(agentDir);
  const allPaths = [];
  const seen = /* @__PURE__ */ new Set();
  const addPaths = (paths) => {
    for (const p of paths) {
      const resolved = path.resolve(p);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        allPaths.push(p);
      }
    }
  };
  const localExtDir = path.join(resolvedCwd, CONFIG_DIR_NAME, "extensions");
  addPaths(discoverExtensionsInDir(localExtDir));
  const globalExtDir = path.join(resolvedAgentDir, "extensions");
  addPaths(discoverExtensionsInDir(globalExtDir));
  for (const p of configuredPaths) {
    const resolved = resolvePath(p, resolvedCwd, { normalizeUnicodeSpaces: true });
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const entries = resolveExtensionEntries(resolved);
      if (entries) {
        addPaths(entries);
        continue;
      }
      addPaths(discoverExtensionsInDir(resolved));
      continue;
    }
    addPaths([resolved]);
  }
  return loadExtensions(allPaths, resolvedCwd, eventBus);
}
export {
  clearExtensionCache,
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadExtensionFromFactory,
  loadExtensions,
  loadExtensionsCached
};
