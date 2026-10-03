// Public OpenAI text-token tables. Dollar rates are per million tokens.
const rate = value => /^\$\d+(?:\.\d+)?$/.test(value) ? Number(value.slice(1)) : null;
const cells = line => line.split('|').slice(1, -1).map(value => value.trim());
export function parseOpenAIPricing(markdown, fetchedAt = new Date().toISOString()) {
  const models = {};
  let tier = null, header = null;
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.startsWith('#')) {
      tier = /^### (Standard|Batch|Flex|Fast|Ultrafast) pricing data$/.exec(line)?.[1]?.toLowerCase() ?? null;
      header = null;
    }
    if (!tier || !line.startsWith('|')) continue;
    const values = cells(line);
    if (values[0] === 'Model') { header = values; continue; }
    if (!header || !/^(?:gpt-|chatgpt-|o\d|codex)/.test(values[0])) continue;
    const id = values[0].replace(/\s+\([^)]*\)$/, '');
    const at = name => rate(values[header.indexOf(name)] ?? '');
    const short = { input: at('Short context input'), cacheRead: at('Short context cached input'), cacheWrite: at('Short context cache writes'), output: at('Short context output') };
    if (short.input == null || short.output == null) throw new Error(`Invalid ${tier} pricing for ${id}.`);
    const long = { input: at('Long context input'), cacheRead: at('Long context cached input'), cacheWrite: at('Long context cache writes'), output: at('Long context output') };
    const tiers = (models[id] ??= { tiers: {} }).tiers;
    // A missing long-context row is unsupported, never guessed by scaling.
    tiers[tier] = { short, long: long.input != null && long.output != null ? long : null, inputTokensAbove: 272000 };
  }
  if (Object.keys(models).length < 1 || !Object.values(models).every(model => model.tiers.standard)) throw new Error('Invalid OpenAI pricing tables.');
  return { version: 1, source: 'https://developers.openai.com/api/docs/pricing', fetchedAt, models };
}
