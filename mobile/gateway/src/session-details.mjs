import { aggregateUsage } from './usage-records.mjs';
const metric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function projectSessionDetails(details) {
  const rows=(details?.turns||[]).filter(turn=>turn.usage).map(turn=>({id:turn.id,harness:'zyra',model:String(turn.model||details.model||'Unknown model').slice(0,160),
    inputTokens:Math.max(0,(metric(turn.usage.inputTokens)||0)-(turn.usage.inputIncludesCachedTokens ? (metric(turn.usage.cachedInputTokens)||0)+(metric(turn.usage.cacheWriteTokens)||0) : 0)),cachedInputTokens:metric(turn.usage.cachedInputTokens)||0,cacheWriteTokens:metric(turn.usage.cacheWriteTokens)||0,
    outputTokens:metric(turn.usage.outputTokens)||0,reasoningTokens:metric(turn.usage.reasoningOutputTokens)||0,responseCount:turn.usage.responseCount,costSource:turn.usage.costSource,serviceTier:turn.usage.pricingServiceTier ?? turn.serviceTier,reportedCostUsd:turn.usage.costSource==='unpriced' ? null : metric(turn.usage.costUsd)}));
  const aggregate=aggregateUsage(rows);
  return {available:true,model:details?.model||null,context:{usedTokens:metric(details?.totals?.contextTokens),windowTokens:metric(details?.totals?.modelContextWindow)},
    usage:aggregate.totals,models:aggregate.models,fetchedAt:details?.fetchedAt||null,
    note:'Recorded model costs and standard API estimates are not subscription charges. Context is available while this chat is loaded on the PC.'};
}
