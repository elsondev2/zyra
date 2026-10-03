import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { withProviderStoreLock, writeProviderJson } from "../provider-transactions.mjs";
import { isTransportSupportPending } from "../model-compatibility.mjs";

export const ZYRA_MEMORY_MODEL_AUTO = "auto";

export function zyraMemoryModelPreferencesPath(dataRoot = process.env.ZYRA_DATA_ROOT || homedir()) {
  return path.join(path.resolve(dataRoot), ".zyra", "memory-model-preferences.json");
}

export function normalizeZyraMemoryModelPreference(value) {
  const model = String(value ?? "").trim();
  if (model === ZYRA_MEMORY_MODEL_AUTO) return model;
  const slash = model.indexOf("/");
  const provider = model.slice(0, slash);
  const modelId = model.slice(slash + 1);
  if (slash < 1 || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(provider)
    || !/^[a-z0-9][a-z0-9._:/@+-]{0,399}$/i.test(modelId)) {
    throw new Error("Choose Automatic or a model from a connected provider.");
  }
  return model;
}

export function readZyraMemoryModelPreference(file = zyraMemoryModelPreferencesPath()) {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid preference.");
    return normalizeZyraMemoryModelPreference(saved.model);
  } catch (error) {
    if (error.code === "ENOENT") return ZYRA_MEMORY_MODEL_AUTO;
    throw new Error("Memory model preference could not be read.");
  }
}

export async function saveZyraMemoryModelPreference(value, file = zyraMemoryModelPreferencesPath()) {
  const model = normalizeZyraMemoryModelPreference(value);
  await withProviderStoreLock(file, async () => writeProviderJson(file, { model }));
  return model;
}

export function resolveZyraMemoryModelSelection({
  activeModel,
  activeThinking,
  availableModels = [],
  preference = ZYRA_MEMORY_MODEL_AUTO,
  defaultModel,
} = {}) {
  const normalized = normalizeZyraMemoryModelPreference(preference);
  if (normalized !== ZYRA_MEMORY_MODEL_AUTO) {
    return { model: normalized, thinking: recommendedMemoryThinking(normalized), recommended: false };
  }

  const activeSelector = modelSelector(activeModel) || String(defaultModel ?? "").trim();
  const provider = activeModel?.provider || activeSelector.split("/", 1)[0];
  let preferred;
  if (provider === "openai" || provider === "openai-codex") {
    preferred = findAvailableModel(availableModels, `${provider}/gpt-5.6-luna`);
  } else if (provider === "anthropic") {
    preferred = findAvailableModel(availableModels, "anthropic/claude-sonnet-5");
  } else if (provider === "opencode") {
    preferred = findAvailableModel(availableModels, "opencode/big-pickle");
  } else if (provider === "opencode-harness") {
    preferred = findHarnessLuna(availableModels) ?? findHarnessBigPickle(availableModels);
  }

  if (preferred) {
    const model = modelSelector(preferred);
    return { model, thinking: recommendedMemoryThinking(model), recommended: true };
  }

  return {
    model: activeSelector || String(defaultModel ?? "").trim(),
    thinking: recommendedMemoryThinking(activeSelector) ?? activeThinking ?? "medium",
    recommended: false,
  };
}

function modelSelector(model) {
  if (typeof model === "string") return model;
  return model?.provider && model?.id ? `${model.provider}/${model.id}` : "";
}

function findAvailableModel(models, selector) {
  return models.find((model) => modelSelector(model) === selector && !isTransportSupportPending(model));
}

function findHarnessLuna(models) {
  return models.find((model) => model?.provider === "opencode-harness"
    && /^openai-codex\/(?:.+\/)?gpt-5\.6-luna$/i.test(String(model.id ?? "")) && supportsHarnessEffort(model, "medium"))
    ?? models.find((model) => model?.provider === "opencode-harness"
      && /^openai\/(?:.+\/)?gpt-5\.6-luna$/i.test(String(model.id ?? "")) && supportsHarnessEffort(model, "medium"));
}

function supportsHarnessEffort(model, effort) {
  const variants = model?.harness?.variants;
  return !Array.isArray(variants) || variants.length === 0
    || variants.some((variant) => String(variant).toLowerCase() === effort);
}

function findHarnessBigPickle(models) {
  return models.find((model) => model?.provider === "opencode-harness"
    && /^opencode\/(?:.+\/)?big-pickle$/i.test(String(model.id ?? ""))
    && model.harness?.free === true);
}

function recommendedMemoryThinking(model) {
  const selector = typeof model === "string" ? model : modelSelector(model);
  if (/gpt-5\.6-luna/i.test(selector)) return "medium";
  if (/claude-sonnet-5/i.test(selector)) return "low";
  if (/big-pickle/i.test(selector)) return "medium";
  return undefined;
}
