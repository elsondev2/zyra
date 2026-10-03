const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

// Account visibility helper for callers that need endpoint IDs only.
// Full discovery and capability metadata live in openai-model-catalog.mjs.
export async function listAccountOpenAIModelIds({ authStorage, fetchImpl = fetch, signal } = {}) {
  if (!authStorage?.hasAuth?.("openai")) return null;
  const apiKey = await authStorage.getApiKey("openai");
  if (!apiKey) throw new Error("OpenAI API key is unavailable.");

  const response = await fetchImpl(OPENAI_MODELS_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "error",
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenAI model list failed (HTTP ${response.status}).`);
  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error("OpenAI returned an invalid model list.");
  return new Set(body.data.map((model) => model?.id).filter((id) => typeof id === "string" && id.length > 0));
}

export function retainAccountOpenAIModels(models, accountModelIds) {
  if (!accountModelIds) return models;
  return models.filter((model) => !model.id.startsWith("openai/") || accountModelIds.has(model.id.slice("openai/".length)));
}
