import { createHash } from 'node:crypto';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const time = value => typeof value === 'number' ? value : Date.parse(value);
const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function usageRecord(harness, row, state = {}) {
  const payload = row?.payload || {};
  if (harness === 'codex') {
    if (row.type === 'session_meta' && !state.session) {
      state.session = payload.id; state.cwd = payload.cwd;
      if (payload.forked_from_id || payload.source?.subagent?.thread_spawn) { state.forkDetected = true; }
    }
    if (row.type === 'turn_context') { state.model = payload.model || state.model; state.cwd = payload.cwd || state.cwd; }
    if (payload.type !== 'token_count' || !payload.info?.last_token_usage || !state.model) return null;
    const usage = payload.info.last_token_usage, timestamp = time(row.timestamp);
    const signature = JSON.stringify(payload.info.total_token_usage || usage);
    if (signature === state.signature) return null;
    state.signature = signature;
    // Fork ledgers may replay parent usage with rewritten timestamps. No stable
    // origin IDs are available here, so omit the ambiguous ledger instead of guessing.
    if (state.forkDetected) return null;
    const input = number(usage.input_tokens), cached = Math.min(input, number(usage.cached_input_tokens)), written = Math.min(input-cached,number(usage.cache_write_input_tokens));
    return record(harness, state.cwd, state.model, timestamp, state.session + ':' + signature,
      input - cached - written, cached, written, number(usage.output_tokens), number(usage.reasoning_output_tokens), null);
  }
  if (harness === 'zyra') {
    if (row.type === 'session') { state.cwd = row.cwd || state.cwd; state.session = row.id; }
    const message = row.message;
    if (row.type !== 'message' || message?.role !== 'assistant' || !message.usage) return null;
    const usage = message.usage;
    return record(harness, state.cwd, message.model || 'Unknown model', time(row.timestamp || message.timestamp), row.id || message.id || state.session + ':' + row.timestamp,
      number(usage.input), number(usage.cacheRead), number(usage.cacheWrite), number(usage.output), number(usage.reasoningTokens), typeof usage.cost === 'object' ? usage.cost?.total : usage.cost);
  }
  if (harness === 'claude') {
    state.cwd = row.cwd || state.cwd;
    const message = row.message;
    if (row.type !== 'assistant' || !message?.usage) return null;
    const usage = message.usage;
    return record(harness, state.cwd, message.model || 'Unknown model', time(row.timestamp), (message.id || row.uuid || row.timestamp) + ':' + (row.requestId || ''),
      number(usage.input_tokens), number(usage.cache_read_input_tokens), number(usage.cache_creation_input_tokens), number(usage.output_tokens), 0, row.costUSD);
  }
  if (harness === 'opencode') {
    if (row.role !== 'assistant' || !row.tokens) return null;
    return record(harness, row.directory || row.path?.cwd || state.cwd, row.modelID || 'Unknown model', time(row.time?.completed || row.time?.created), row.id,
      number(row.tokens.input), number(row.tokens.cache?.read), number(row.tokens.cache?.write), number(row.tokens.output), number(row.tokens.reasoning), row.cost);
  }
  return null;
}
function record(harness, cwd, model, timestamp, id, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens, cost) {
  if (!cwd || !Number.isFinite(timestamp) || !(inputTokens + cachedInputTokens + cacheWriteTokens + outputTokens)) return null;
  return { harness, cwd, model: String(model).slice(0, 160), timestamp, id: hash(harness + ':' + id), inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens,
    reasoningTokens: Math.min(reasoningTokens, outputTokens), reportedCostUsd: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null };
}
// Standard API token rates, checked 2026-09-15 against the linked primary sources.
// Unknown models remain unpriced. These are not subscription charges or invoices.
export const pricingSources = ['https://developers.openai.com/api/docs/models/gpt-5.5', 'https://developers.openai.com/api/docs/models/gpt-5.4', 'https://platform.claude.com/docs/en/about-claude/pricing'];
const rates = { 'gpt-5.5': [5,.5,5,30], 'gpt-5.4': [2.5,.25,2.5,15],
  'claude-sonnet-4-6': [3,.3,3.75,15], 'claude-sonnet-4-5': [3,.3,3.75,15], 'claude-haiku-4-5': [1,.1,1.25,5], 'claude-opus-4-6': [5,.5,6.25,25] };
export function priceRecord(row) {
  const model = row.model.toLowerCase().split('/').pop().replace(/-\d{8}$/, '');
  const rate = rates[model];
  // Cache-write duration is not always recorded; do not guess a Claude write tier.
  if (!rate || (model.startsWith('claude-') && row.cacheWriteTokens > 0)) return null;
  // GPT long-context tiers can change input/output prices; omit unknown-tier rows.
  if (model.startsWith('gpt-') && row.inputTokens + row.cachedInputTokens > 272000) return null;
  return (row.inputTokens*rate[0] + row.cachedInputTokens*rate[1] + row.cacheWriteTokens*rate[2] + row.outputTokens*rate[3])/1e6;
}
const usageFields = ['responses','inputTokens','cachedInputTokens','cacheWriteTokens','outputTokens','reasoningTokens','totalTokens','reportedCostUsd','estimatedCostUsd','reportedResponses','estimatedResponses','unpricedResponses'];
const emptyUsage = () => Object.fromEntries(usageFields.map(field => [field, 0]));
const DAY = 86400000;
/** UTC calendar days, including the current partial day; no extra phone timezone parameter. */
export function usagePeriod(now = Date.now()) {
  const midnight = Math.floor(now / DAY) * DAY;
  return { timeZone:'UTC', start:new Date(midnight - 29*DAY).toISOString(), end:new Date(now).toISOString(), days:30 };
}
function addUsage(group, row) {
  group.responses++;
  for (const field of ['inputTokens','cachedInputTokens','cacheWriteTokens','outputTokens','reasoningTokens']) group[field] += number(row[field]);
  group.totalTokens = group.inputTokens + group.cachedInputTokens + group.cacheWriteTokens + group.outputTokens;
  const estimate = priceRecord(row);
  if (row.reportedCostUsd != null && (row.reportedCostUsd > 0 || estimate != null)) { group.reportedCostUsd += row.reportedCostUsd; group.reportedResponses++; }
  else if (estimate == null) group.unpricedResponses++;
  else { group.estimatedCostUsd += estimate; group.estimatedResponses++; }
}
export function aggregateUsage(records, period = null) {
  const models = new Map(), responses = new Map(), days = new Map();
  const since = period ? Date.parse(period.start) : null, until = period ? Date.parse(period.end) : null;
  if (period) for (let day=0;day<30;day++) {
    const date=new Date(since+day*DAY).toISOString().slice(0,10);
    days.set(date,{date,...emptyUsage()});
  }
  const tokens = row => number(row.inputTokens)+number(row.cachedInputTokens)+number(row.cacheWriteTokens)+number(row.outputTokens);
  // Claude can repeat one logical assistant response as its content/usage grows.
  // Retain its complete high-water usage snapshot, including across copied logs.
  for (const row of records) {
    if (period && (!Number.isFinite(row.timestamp) || row.timestamp<since || row.timestamp>until)) continue;
    const previous=responses.get(row.id);
    if (!previous || tokens(row)>tokens(previous) || (tokens(row)===tokens(previous) && row.timestamp>=previous.timestamp)) responses.set(row.id,row);
  }
  for (const row of responses.values()) {
    const key = row.harness + ':' + row.model;
    const group = models.get(key) || { harness:row.harness, model:row.model, ...emptyUsage() };
    addUsage(group,row); models.set(key,group);
    if (period) addUsage(days.get(new Date(row.timestamp).toISOString().slice(0,10)),row);
  }
  const rows = [...models.values()].sort((a,b)=>b.totalTokens-a.totalTokens), daily=[...days.values()];
  const totals = Object.fromEntries(usageFields.map(key=>[key,(period ? daily : rows).reduce((sum,row)=>sum+row[key],0)]));
  return { totals, models:rows.slice(0,100), modelsTruncated:rows.length>100, ...(period ? {daily,period} : {}) };
}
