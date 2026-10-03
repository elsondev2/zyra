import { estimateModelCost } from './index.mjs';

/** Reprice Zyra's local OpenAI estimates per response, never aggregated turns. */
export function assistantMessageCost(message) {
  const usage = message?.usage;
  if (!usage) return null;
  const model = message.provider ? `${message.provider}/${message.model}` : message.model;
  const openai = /^(?:openai(?:-codex)?\/|gpt-|chatgpt-|o\d|codex)/.test(model ?? '');
  if (openai && usage.cost?.source !== 'reported') {
    // Keep the estimate charged for a response once its pricing version is
    // recorded. A later price change must not rewrite historical usage.
    if (usage.cost?.source === 'api-equivalent' && usage.cost.pricingFetchedAt) return usage.cost;
    return estimateModelCost(model, usage, usage.cost?.serviceTier ?? message.serviceTier);
  }
  return usage.cost?.source !== 'unpriced' && typeof usage.cost?.total === 'number' && Number.isFinite(usage.cost.total)
    ? usage.cost : null;
}
