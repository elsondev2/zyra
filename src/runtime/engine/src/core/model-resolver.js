// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import {
  modelsAreEqual
} from "../../../providers/src/index.js";
import chalk from "chalk";
import { minimatch } from "minimatch";
import { isValidThinkingLevel } from "../cli/args.js";
import { DEFAULT_THINKING_LEVEL } from "./defaults.js";
const defaultModelPerProvider = {
  "amazon-bedrock": "us.anthropic.claude-opus-4-6-v1",
  "ant-ling": "Ring-2.6-1T",
  anthropic: "claude-opus-4-8",
  openai: "gpt-5.5",
  "azure-openai-responses": "gpt-5.4",
  "openai-codex": "gpt-5.5",
  radius: "auto",
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  deepseek: "deepseek-v4-pro",
  google: "gemini-3.1-pro-preview",
  "google-vertex": "gemini-3.1-pro-preview",
  "github-copilot": "gpt-5.4",
  openrouter: "moonshotai/kimi-k2.6",
  "vercel-ai-gateway": "zai/glm-5.1",
  xai: "grok-4.6",
  groq: "openai/gpt-oss-120b",
  cerebras: "gpt-oss-120b",
  zai: "glm-5.3",
  "zai-coding-cn": "glm-5.3",
  mistral: "devstral-medium-latest",
  minimax: "MiniMax-M2.7",
  "minimax-cn": "MiniMax-M2.7",
  moonshotai: "kimi-k2.6",
  "moonshotai-cn": "kimi-k2.6",
  huggingface: "moonshotai/Kimi-K2.6",
  fireworks: "accounts/fireworks/models/kimi-k2p6",
  together: "moonshotai/Kimi-K2.6",
  baseten: "zai-org/GLM-5.2",
  opencode: "kimi-k2.6",
  "opencode-go": "kimi-k2.6",
  "kimi-coding": "kimi-for-coding",
  "cloudflare-workers-ai": "@cf/moonshotai/kimi-k2.6",
  "cloudflare-ai-gateway": "workers-ai/@cf/moonshotai/kimi-k2.6",
  "qwen-token-plan": "qwen3.7-max",
  "qwen-token-plan-cn": "qwen3.7-max",
  "qwen-token-plan-individual": "qwen3.8-max",
  xiaomi: "mimo-v2.5-pro",
  "xiaomi-token-plan-cn": "mimo-v2.5-pro",
  "xiaomi-token-plan-ams": "mimo-v2.5-pro",
  "xiaomi-token-plan-sgp": "mimo-v2.5-pro"
};
function isAlias(id) {
  if (id.endsWith("-latest")) return true;
  const datePattern = /-\d{8}$/;
  return !datePattern.test(id);
}
function findExactModelReferenceMatch(modelReference, availableModels) {
  const trimmedReference = modelReference.trim();
  if (!trimmedReference) {
    return void 0;
  }
  const normalizedReference = trimmedReference.toLowerCase();
  const canonicalMatches = availableModels.filter(
    (model) => `${model.provider}/${model.id}`.toLowerCase() === normalizedReference
  );
  if (canonicalMatches.length === 1) {
    return canonicalMatches[0];
  }
  if (canonicalMatches.length > 1) {
    return void 0;
  }
  const slashIndex = trimmedReference.indexOf("/");
  if (slashIndex !== -1) {
    const provider = trimmedReference.substring(0, slashIndex).trim();
    const modelId = trimmedReference.substring(slashIndex + 1).trim();
    if (provider && modelId) {
      const providerMatches = availableModels.filter(
        (model) => model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === modelId.toLowerCase()
      );
      if (providerMatches.length === 1) {
        return providerMatches[0];
      }
      if (providerMatches.length > 1) {
        return void 0;
      }
    }
  }
  const idMatches = availableModels.filter((model) => model.id.toLowerCase() === normalizedReference);
  return idMatches.length === 1 ? idMatches[0] : void 0;
}
function tryMatchModel(modelPattern, availableModels) {
  const exactMatch = findExactModelReferenceMatch(modelPattern, availableModels);
  if (exactMatch) {
    return exactMatch;
  }
  const matches = availableModels.filter(
    (m) => m.id.toLowerCase().includes(modelPattern.toLowerCase()) || m.name?.toLowerCase().includes(modelPattern.toLowerCase())
  );
  if (matches.length === 0) {
    return void 0;
  }
  const aliases = matches.filter((m) => isAlias(m.id));
  const datedVersions = matches.filter((m) => !isAlias(m.id));
  if (aliases.length > 0) {
    aliases.sort((a, b) => b.id.localeCompare(a.id));
    return aliases[0];
  } else {
    datedVersions.sort((a, b) => b.id.localeCompare(a.id));
    return datedVersions[0];
  }
}
function buildFallbackModel(provider, modelId, availableModels) {
  const providerModels = availableModels.filter((m) => m.provider === provider);
  if (providerModels.length === 0) return void 0;
  const defaultId = defaultModelPerProvider[provider];
  const baseModel = defaultId ? providerModels.find((m) => m.id === defaultId) ?? providerModels[0] : providerModels[0];
  return {
    ...baseModel,
    id: modelId,
    name: modelId
  };
}
function parseModelPattern(pattern, availableModels, options) {
  const exactMatch = tryMatchModel(pattern, availableModels);
  if (exactMatch) {
    return { model: exactMatch, thinkingLevel: void 0, warning: void 0 };
  }
  const lastColonIndex = pattern.lastIndexOf(":");
  if (lastColonIndex === -1) {
    return { model: void 0, thinkingLevel: void 0, warning: void 0 };
  }
  const prefix = pattern.substring(0, lastColonIndex);
  const suffix = pattern.substring(lastColonIndex + 1);
  if (isValidThinkingLevel(suffix)) {
    const result = parseModelPattern(prefix, availableModels, options);
    if (result.model) {
      return {
        model: result.model,
        thinkingLevel: result.warning ? void 0 : suffix,
        warning: result.warning
      };
    }
    return result;
  } else {
    const allowFallback = options?.allowInvalidThinkingLevelFallback ?? true;
    if (!allowFallback) {
      return { model: void 0, thinkingLevel: void 0, warning: void 0 };
    }
    const result = parseModelPattern(prefix, availableModels, options);
    if (result.model) {
      return {
        model: result.model,
        thinkingLevel: void 0,
        warning: `Invalid thinking level "${suffix}" in pattern "${pattern}". Using default instead.`
      };
    }
    return result;
  }
}
function resolveModelScopeFromModels(patterns, models) {
  const availableModels = [...models];
  const scopedModels = [];
  const diagnostics = [];
  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
      const colonIdx = pattern.lastIndexOf(":");
      let globPattern = pattern;
      let thinkingLevel2;
      if (colonIdx !== -1) {
        const suffix = pattern.substring(colonIdx + 1);
        if (isValidThinkingLevel(suffix)) {
          thinkingLevel2 = suffix;
          globPattern = pattern.substring(0, colonIdx);
        }
      }
      const exactMatch = findExactModelReferenceMatch(globPattern, availableModels);
      if (exactMatch) {
        if (!scopedModels.find((sm) => modelsAreEqual(sm.model, exactMatch))) {
          scopedModels.push({ model: exactMatch, thinkingLevel: thinkingLevel2 });
        }
        continue;
      }
      const matchingModels = availableModels.filter((m) => {
        const fullId = `${m.provider}/${m.id}`;
        return minimatch(fullId, globPattern, { nocase: true }) || minimatch(m.id, globPattern, { nocase: true });
      });
      if (matchingModels.length === 0) {
        diagnostics.push({
          type: "warning",
          code: "no-match",
          message: `No models match pattern "${pattern}"`,
          pattern
        });
        continue;
      }
      for (const model2 of matchingModels) {
        if (!scopedModels.find((sm) => modelsAreEqual(sm.model, model2))) {
          scopedModels.push({ model: model2, thinkingLevel: thinkingLevel2 });
        }
      }
      continue;
    }
    const { model, thinkingLevel, warning } = parseModelPattern(pattern, availableModels);
    if (warning) {
      diagnostics.push({ type: "warning", code: "invalid-thinking-level", message: warning, pattern });
    }
    if (!model) {
      diagnostics.push({
        type: "warning",
        code: "no-match",
        message: `No models match pattern "${pattern}"`,
        pattern
      });
      continue;
    }
    if (!scopedModels.find((sm) => modelsAreEqual(sm.model, model))) {
      scopedModels.push({ model, thinkingLevel });
    }
  }
  return { scopedModels, diagnostics };
}
async function resolveModelScopeWithDiagnostics(patterns, modelRuntime, options) {
  return resolveModelScopeFromModels(patterns, await modelRuntime.getAvailable(void 0, options));
}
async function resolveModelScope(patterns, modelRuntime, options) {
  const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(patterns, modelRuntime, options);
  for (const diagnostic of diagnostics) {
    console.warn(chalk.yellow(`Warning: ${diagnostic.message}`));
  }
  return scopedModels;
}
function resolveCliModel(options) {
  const { cliProvider, cliModel, cliThinking, modelRuntime } = options;
  if (!cliModel) {
    return { model: void 0, warning: void 0, error: void 0 };
  }
  const availableModels = [...modelRuntime.getModels()];
  if (availableModels.length === 0) {
    return {
      model: void 0,
      warning: void 0,
      error: "No models available. Check your installation or add models to models.json."
    };
  }
  const providerMap = /* @__PURE__ */ new Map();
  for (const m of availableModels) {
    providerMap.set(m.provider.toLowerCase(), m.provider);
  }
  let provider = cliProvider ? providerMap.get(cliProvider.toLowerCase()) : void 0;
  if (cliProvider && !provider) {
    return {
      model: void 0,
      warning: void 0,
      error: `Unknown provider "${cliProvider}". Use --list-models to see available providers/models.`
    };
  }
  let pattern = cliModel;
  let inferredProvider = false;
  if (!provider) {
    const slashIndex = cliModel.indexOf("/");
    if (slashIndex !== -1) {
      const maybeProvider = cliModel.substring(0, slashIndex);
      const canonical = providerMap.get(maybeProvider.toLowerCase());
      if (canonical) {
        provider = canonical;
        pattern = cliModel.substring(slashIndex + 1);
        inferredProvider = true;
      }
    }
  }
  if (!provider) {
    const lower = cliModel.toLowerCase();
    const exactMatches = availableModels.filter(
      (m) => m.id.toLowerCase() === lower || `${m.provider}/${m.id}`.toLowerCase() === lower
    );
    if (exactMatches.length === 1) {
      return { model: exactMatches[0], warning: void 0, thinkingLevel: void 0, error: void 0 };
    }
    if (exactMatches.length > 1) {
      const authenticatedExactMatches = exactMatches.filter((m) => modelRuntime.hasConfiguredAuth(m.provider));
      if (authenticatedExactMatches.length === 1) {
        return {
          model: authenticatedExactMatches[0],
          warning: void 0,
          thinkingLevel: void 0,
          error: void 0
        };
      }
      const matches = exactMatches.map((m) => `${m.provider}/${m.id}`).sort((a, b) => a.localeCompare(b)).join(", ");
      const authHint = authenticatedExactMatches.length === 0 ? "No matching provider is authenticated." : "More than one matching provider is authenticated.";
      return {
        model: void 0,
        warning: void 0,
        thinkingLevel: void 0,
        error: `Model "${cliModel}" is ambiguous across providers: ${matches}. ${authHint} Use --provider or provider/model.`
      };
    }
  }
  if (cliProvider && provider) {
    const prefix = `${provider}/`;
    if (cliModel.toLowerCase().startsWith(prefix.toLowerCase())) {
      pattern = cliModel.substring(prefix.length);
    }
  }
  const candidates = provider ? availableModels.filter((m) => m.provider === provider) : availableModels;
  const { model, thinkingLevel, warning } = parseModelPattern(pattern, candidates, {
    allowInvalidThinkingLevelFallback: false
  });
  if (model) {
    if (inferredProvider) {
      const rawExactMatches = availableModels.filter(
        (m) => m.id.toLowerCase() === cliModel.toLowerCase() && !modelsAreEqual(m, model)
      );
      if (rawExactMatches.length > 0 && !modelRuntime.hasConfiguredAuth(model.provider)) {
        const authenticatedRawMatches = rawExactMatches.filter((m) => modelRuntime.hasConfiguredAuth(m.provider));
        if (authenticatedRawMatches.length === 1) {
          return {
            model: authenticatedRawMatches[0],
            thinkingLevel: void 0,
            warning: void 0,
            error: void 0
          };
        }
      }
    }
    return { model, thinkingLevel, warning, error: void 0 };
  }
  if (inferredProvider) {
    const lower = cliModel.toLowerCase();
    const exact = availableModels.find(
      (m) => m.id.toLowerCase() === lower || `${m.provider}/${m.id}`.toLowerCase() === lower
    );
    if (exact) {
      return { model: exact, warning: void 0, thinkingLevel: void 0, error: void 0 };
    }
    const fallback = parseModelPattern(cliModel, availableModels, {
      allowInvalidThinkingLevelFallback: false
    });
    if (fallback.model) {
      return {
        model: fallback.model,
        thinkingLevel: fallback.thinkingLevel,
        warning: fallback.warning,
        error: void 0
      };
    }
  }
  if (provider) {
    let fallbackPattern = pattern;
    let fallbackThinking;
    if (!cliThinking) {
      const lastColon = pattern.lastIndexOf(":");
      if (lastColon !== -1) {
        const suffix = pattern.substring(lastColon + 1);
        if (isValidThinkingLevel(suffix)) {
          fallbackPattern = pattern.substring(0, lastColon);
          fallbackThinking = suffix;
        }
      }
    }
    const fallbackModel = buildFallbackModel(provider, fallbackPattern, availableModels);
    if (fallbackModel) {
      const requestedThinking = cliThinking ?? fallbackThinking;
      const model2 = requestedThinking && requestedThinking !== "off" ? { ...fallbackModel, reasoning: true } : fallbackModel;
      const fallbackWarning = warning ? `${warning} Model "${fallbackPattern}" not found for provider "${provider}". Using custom model id.` : `Model "${fallbackPattern}" not found for provider "${provider}". Using custom model id.`;
      return { model: model2, thinkingLevel: fallbackThinking, warning: fallbackWarning, error: void 0 };
    }
  }
  const display = provider ? `${provider}/${pattern}` : cliModel;
  return {
    model: void 0,
    thinkingLevel: void 0,
    warning,
    error: `Model "${display}" not found. Use --list-models to see available models.`
  };
}
async function findInitialModel(options) {
  const {
    cliProvider,
    cliModel,
    scopedModels,
    isContinuing,
    defaultProvider,
    defaultModelId,
    defaultThinkingLevel,
    modelThinkingLevels,
    modelRuntime
  } = options;
  let model;
  let thinkingLevel = DEFAULT_THINKING_LEVEL;
  if (cliProvider && cliModel) {
    const resolved = resolveCliModel({
      cliProvider,
      cliModel,
      modelRuntime
    });
    if (resolved.error) {
      console.error(chalk.red(resolved.error));
      process.exit(1);
    }
    if (resolved.model) {
      return { model: resolved.model, thinkingLevel: DEFAULT_THINKING_LEVEL, fallbackMessage: void 0 };
    }
  }
  if (scopedModels.length > 0 && !isContinuing) {
    const scopedModel = scopedModels[0];
    const perModel = modelThinkingLevels?.[`${scopedModel.model.provider}/${scopedModel.model.id}`];
    return {
      model: scopedModel.model,
      thinkingLevel: scopedModel.thinkingLevel ?? perModel ?? defaultThinkingLevel ?? DEFAULT_THINKING_LEVEL,
      fallbackMessage: void 0
    };
  }
  if (defaultProvider && defaultModelId) {
    const found = modelRuntime.getModel(defaultProvider, defaultModelId);
    if (found && modelRuntime.hasConfiguredAuth(found.provider)) {
      model = found;
      const perModel = modelThinkingLevels?.[`${defaultProvider}/${defaultModelId}`];
      if (perModel) {
        thinkingLevel = perModel;
      } else if (defaultThinkingLevel) {
        thinkingLevel = defaultThinkingLevel;
      }
      return { model, thinkingLevel, fallbackMessage: void 0 };
    }
  }
  const availableModels = [...modelRuntime.getAvailableSnapshot()];
  if (availableModels.length > 0) {
    for (const provider of Object.keys(defaultModelPerProvider)) {
      const defaultId = defaultModelPerProvider[provider];
      const match = availableModels.find((m) => m.provider === provider && m.id === defaultId);
      if (match) {
        return { model: match, thinkingLevel: DEFAULT_THINKING_LEVEL, fallbackMessage: void 0 };
      }
    }
    return { model: availableModels[0], thinkingLevel: DEFAULT_THINKING_LEVEL, fallbackMessage: void 0 };
  }
  return { model: void 0, thinkingLevel: DEFAULT_THINKING_LEVEL, fallbackMessage: void 0 };
}
async function restoreModelFromSession(savedProvider, savedModelId, currentModel, shouldPrintMessages, modelRuntime) {
  const restoredModel = modelRuntime.getModel(savedProvider, savedModelId);
  const hasConfiguredAuth = restoredModel ? modelRuntime.hasConfiguredAuth(restoredModel.provider) : false;
  if (restoredModel && hasConfiguredAuth) {
    if (shouldPrintMessages) {
      console.log(chalk.dim(`Restored model: ${savedProvider}/${savedModelId}`));
    }
    return { model: restoredModel, fallbackMessage: void 0 };
  }
  const reason = !restoredModel ? "model no longer exists" : "no auth configured";
  if (shouldPrintMessages) {
    console.error(chalk.yellow(`Warning: Could not restore model ${savedProvider}/${savedModelId} (${reason}).`));
  }
  if (currentModel) {
    if (shouldPrintMessages) {
      console.log(chalk.dim(`Falling back to: ${currentModel.provider}/${currentModel.id}`));
    }
    return {
      model: currentModel,
      fallbackMessage: `Could not restore model ${savedProvider}/${savedModelId} (${reason}). Using ${currentModel.provider}/${currentModel.id}.`
    };
  }
  const availableModels = [...modelRuntime.getAvailableSnapshot()];
  if (availableModels.length > 0) {
    let fallbackModel;
    for (const provider of Object.keys(defaultModelPerProvider)) {
      const defaultId = defaultModelPerProvider[provider];
      const match = availableModels.find((m) => m.provider === provider && m.id === defaultId);
      if (match) {
        fallbackModel = match;
        break;
      }
    }
    if (!fallbackModel) {
      fallbackModel = availableModels[0];
    }
    if (shouldPrintMessages) {
      console.log(chalk.dim(`Falling back to: ${fallbackModel.provider}/${fallbackModel.id}`));
    }
    return {
      model: fallbackModel,
      fallbackMessage: `Could not restore model ${savedProvider}/${savedModelId} (${reason}). Using ${fallbackModel.provider}/${fallbackModel.id}.`
    };
  }
  return { model: void 0, fallbackMessage: void 0 };
}
export {
  defaultModelPerProvider,
  findExactModelReferenceMatch,
  findInitialModel,
  parseModelPattern,
  resolveCliModel,
  resolveModelScope,
  resolveModelScopeFromModels,
  resolveModelScopeWithDiagnostics,
  restoreModelFromSession
};
