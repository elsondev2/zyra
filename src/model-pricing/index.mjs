import baseline from './snapshot.mjs';

let snapshot = baseline;
export const getPricingSnapshot = () => snapshot;
const validRate = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validRates = value => value && typeof value.input === 'number' && typeof value.output === 'number'
  && ['input', 'output', 'cacheRead', 'cacheWrite'].every(key => validRate(value[key]));
export function isModelPricing(value) {
  return Boolean(value?.tiers?.standard && Object.values(value.tiers).every(tier =>
    validRates(tier.short) && (tier.long === null || validRates(tier.long))
    && typeof tier.inputTokensAbove === 'number' && Number.isFinite(tier.inputTokensAbove) && tier.inputTokensAbove >= 0));
}
export function isPricingSnapshot(value) {
  return Boolean(value?.version === 1 && value.source === baseline.source && Number.isFinite(Date.parse(value.fetchedAt))
    && Object.keys(value.models ?? {}).length > 0 && Object.values(value.models).every(isModelPricing));
}
export function installModelCatalogPricing(models) {
  const updates = {};
  let fetchedAt = snapshot.fetchedAt;
  for (const model of models ?? []) {
    if (!/^(?:openai|openai-codex)\//.test(model?.id ?? '') || !isModelPricing(model.pricing)) continue;
    const date = model.pricingFetchedAt;
    if (!Number.isFinite(Date.parse(date)) || Date.parse(date) < Date.parse(snapshot.fetchedAt)) continue;
    updates[model.id.split('/')[1]] = { ...model.pricing, fetchedAt: date };
    if (Date.parse(date) > Date.parse(fetchedAt)) fetchedAt = date;
  }
  if (Object.keys(updates).length) snapshot = { ...snapshot, fetchedAt, models: { ...snapshot.models, ...updates } };
}
export function installPricingSnapshot(value) {
  if (isPricingSnapshot(value)) snapshot = value;
}
export function getModelPricing(model, source = snapshot) {
  const key = String(model ?? '').toLowerCase().replace(/^(?:openai|openai-codex)\//, '');
  if (key.includes('/')) return null;
  return source.models[key] ?? source.models[key.replace(/-\d{4}-\d{2}-\d{2}$/, '')] ?? null;
}
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
export function estimateModelCost(model, usage, serviceTier = null, pricing = getModelPricing(model)) {
  if (!usage || !pricing) return null;
  const cached = number(usage.cacheRead ?? usage.cachedInputTokens);
  const written = number(usage.cacheWrite ?? usage.cacheWriteTokens);
  const rawInput = number(usage.input ?? usage.inputTokens);
  const includesCache = usage.inputIncludesCachedTokens ?? !Object.hasOwn(usage, 'input');
  if (includesCache && cached + written > rawInput) return null;
  const input = rawInput - (includesCache ? cached + written : 0);
  const output = number(usage.output ?? usage.outputTokens);
  const tierName = ({ auto: 'standard', default: 'standard', priority: 'fast', fast: 'fast' })[serviceTier] ?? serviceTier ?? 'standard';
  const tier = pricing.tiers[tierName];
  const rates = tier && (input + cached + written > tier.inputTokensAbove ? tier.long : tier.short);
  if (!rates || (cached > 0 && rates.cacheRead == null) || (written > 0 && rates.cacheWrite == null)) return null;
  const cost = { input: input * rates.input / 1e6, output: output * rates.output / 1e6,
    cacheRead: cached * (rates.cacheRead ?? 0) / 1e6, cacheWrite: written * (rates.cacheWrite ?? 0) / 1e6 };
  return { ...cost, total: cost.input + cost.output + cost.cacheRead + cost.cacheWrite,
    source: 'api-equivalent', serviceTier: tierName, pricingFetchedAt: pricing.fetchedAt ?? snapshot.fetchedAt };
}
// Runtime model transport still requires numeric rate fields. Unknown is marked
// explicitly and must never be interpreted as a free model by consumers.
export function runtimeModelCost(model, pricing = getModelPricing(model)) {
  const short = pricing?.tiers.standard?.short;
  return { input: short?.input ?? 0, output: short?.output ?? 0, cacheRead: short?.cacheRead ?? 0, cacheWrite: short?.cacheWrite ?? 0, pricing };
}
