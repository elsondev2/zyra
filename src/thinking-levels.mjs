export const GPT_56_THINKING_LEVELS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);

const PI_THINKING_LEVELS = Object.freeze(["off", "minimal", "low", "medium", "high", "xhigh"]);
const KNOWN_THINKING_LEVELS = new Set([...PI_THINKING_LEVELS, "none", "max"]);
const GPT_56_MODEL_RE = /(?:^|\/)gpt-5\.6(?:-|$)/i;
const CHATGPT_MODEL_RE = /(?:^|\/)(?:gpt-|codex-)/i;

function modelIdentity(model) {
  if (typeof model === "string") return model;
  return [model?.provider, model?.id].filter(Boolean).join("/");
}

export function isGpt56Model(model) {
  return GPT_56_MODEL_RE.test(String(modelIdentity(model)));
}

export function isChatGptReasoningModel(model) {
  return CHATGPT_MODEL_RE.test(String(modelIdentity(model)));
}

export function normalizeZyraThinkingLevel(value) {
  const level = String(value ?? "").trim().toLowerCase();
  return KNOWN_THINKING_LEVELS.has(level) ? level : undefined;
}

export function getModelThinkingLevels(model, piLevels = PI_THINKING_LEVELS) {
  if (isGpt56Model(model)) return [...GPT_56_THINKING_LEVELS];
  const levels = Array.isArray(piLevels) ? piLevels.filter((level) => KNOWN_THINKING_LEVELS.has(level)) : [];
  if (isChatGptReasoningModel(model)) {
    const chatGptLevels = levels.filter((level) => !["off", "none", "minimal"].includes(level));
    return chatGptLevels.length > 0 ? chatGptLevels : ["low"];
  }
  return levels.length > 0 ? [...levels] : ["off"];
}

export function coerceThinkingLevelForModel(value, model, piLevels = PI_THINKING_LEVELS) {
  const requested = normalizeZyraThinkingLevel(value) ?? "medium";
  const levels = getModelThinkingLevels(model, piLevels);

  if (isGpt56Model(model)) {
    if (["off", "none", "minimal"].includes(requested)) return "low";
    return levels.includes(requested) ? requested : "medium";
  }

  const compatible = isChatGptReasoningModel(model) && ["off", "none", "minimal"].includes(requested)
    ? "low"
    : requested === "none"
      ? "off"
      : requested === "max"
        ? "xhigh"
        : requested;
  if (levels.includes(compatible)) return compatible;
  return clampToAvailablePiLevel(compatible, levels);
}

export function toPiThinkingLevel(value) {
  const level = normalizeZyraThinkingLevel(value) ?? "medium";
  if (level === "none") return "off";
  if (level === "max") return "xhigh";
  return level;
}

export function applyGpt56ThinkingEffort(payload, value) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !isGpt56Model(payload.model)) {
    return payload;
  }
  const level = coerceThinkingLevelForModel(value, payload.model);
  const reasoning = payload.reasoning && typeof payload.reasoning === "object" && !Array.isArray(payload.reasoning)
    ? payload.reasoning
    : {};
  return {
    ...payload,
    reasoning: {
      ...reasoning,
      effort: level,
    },
  };
}

function clampToAvailablePiLevel(requested, levels) {
  const requestedIndex = PI_THINKING_LEVELS.indexOf(requested);
  if (requestedIndex === -1) return levels[0] ?? "off";
  for (let index = requestedIndex; index < PI_THINKING_LEVELS.length; index += 1) {
    if (levels.includes(PI_THINKING_LEVELS[index])) return PI_THINKING_LEVELS[index];
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    if (levels.includes(PI_THINKING_LEVELS[index])) return PI_THINKING_LEVELS[index];
  }
  return levels[0] ?? "off";
}
