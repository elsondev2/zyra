import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeProviderJson, withProviderStoreLock } from '../provider-transactions.mjs';
import { getPricingSnapshot, installPricingSnapshot, isPricingSnapshot } from './index.mjs';
import { parseOpenAIPricing } from './parser.mjs';

const TTL = 6 * 60 * 60_000;
const pending = new Map();
export async function refreshModelPricing(options = {}) {
  const file = options.directory ? join(options.directory, 'openai-pricing.json') : null;
  if (pending.has(file)) return pending.get(file);
  const operation = refresh(file, options);
  pending.set(file, operation);
  try { return await operation; } finally { pending.delete(file); }
}
async function refresh(file, options) {
  if (file) {
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      if (isPricingSnapshot(cached) && Date.parse(cached.fetchedAt) > Date.parse(getPricingSnapshot().fetchedAt)) installPricingSnapshot(cached);
    } catch { /* Retain the published snapshot if the cache is absent or corrupt. */ }
  }
  const current = getPricingSnapshot();
  if (options.cacheOnly || /^(1|true|yes)$/i.test(String((options.env ?? process.env).ZYRA_OFFLINE ?? ''))
      || (!options.forceRefresh && Date.now() - Date.parse(current.fetchedAt) < TTL)) return current;
  try {
    const response = await (options.fetchImpl ?? fetch)('https://developers.openai.com/api/docs/pricing.md', {
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000), headers: { Accept: 'text/markdown' },
    });
    if (!response.ok) throw new Error(`Pricing returned HTTP ${response.status}.`);
    const updated = parseOpenAIPricing(await response.text());
    if (Object.keys(updated.models).length < 10) throw new Error('Incomplete OpenAI pricing table.');
    if (file) await withProviderStoreLock(file, () => writeProviderJson(file, updated));
    installPricingSnapshot(updated);
    return updated;
  } catch { return current; /* Price discovery must not prevent model discovery or sending. */ }
}
