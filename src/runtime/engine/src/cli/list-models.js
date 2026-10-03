// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { fuzzyFilter } from "../../../terminal/src/index.js";
import chalk from "chalk";
import { formatNoModelsAvailableMessage } from "../core/auth-guidance.js";
function formatTokenCount(count) {
  if (count >= 1e6) {
    const millions = count / 1e6;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (count >= 1e3) {
    const thousands = count / 1e3;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return count.toString();
}
async function listModels(modelRuntime, searchPattern, signal) {
  const loadError = modelRuntime.getError();
  if (loadError) {
    console.error(chalk.yellow(`Warning: errors loading models.json:
${loadError}`));
  }
  const models = [...await modelRuntime.getAvailable(void 0, { signal })];
  if (models.length === 0) {
    console.log(formatNoModelsAvailableMessage());
    return;
  }
  let filteredModels = models;
  if (searchPattern) {
    filteredModels = fuzzyFilter(models, searchPattern, (m) => `${m.provider} ${m.id}`);
  }
  if (filteredModels.length === 0) {
    console.log(`No models matching "${searchPattern}"`);
    return;
  }
  filteredModels.sort((a, b) => {
    const providerCmp = a.provider.localeCompare(b.provider);
    if (providerCmp !== 0) return providerCmp;
    return a.id.localeCompare(b.id);
  });
  const rows = filteredModels.map((m) => ({
    provider: m.provider,
    model: m.id,
    context: formatTokenCount(m.contextWindow),
    maxOut: formatTokenCount(m.maxTokens),
    thinking: m.reasoning ? "yes" : "no",
    images: m.input.includes("image") ? "yes" : "no"
  }));
  const headers = {
    provider: "provider",
    model: "model",
    context: "context",
    maxOut: "max-out",
    thinking: "thinking",
    images: "images"
  };
  const widths = {
    provider: Math.max(headers.provider.length, ...rows.map((r) => r.provider.length)),
    model: Math.max(headers.model.length, ...rows.map((r) => r.model.length)),
    context: Math.max(headers.context.length, ...rows.map((r) => r.context.length)),
    maxOut: Math.max(headers.maxOut.length, ...rows.map((r) => r.maxOut.length)),
    thinking: Math.max(headers.thinking.length, ...rows.map((r) => r.thinking.length)),
    images: Math.max(headers.images.length, ...rows.map((r) => r.images.length))
  };
  const headerLine = [
    headers.provider.padEnd(widths.provider),
    headers.model.padEnd(widths.model),
    headers.context.padEnd(widths.context),
    headers.maxOut.padEnd(widths.maxOut),
    headers.thinking.padEnd(widths.thinking),
    headers.images.padEnd(widths.images)
  ].join("  ");
  console.log(headerLine);
  for (const row of rows) {
    const line = [
      row.provider.padEnd(widths.provider),
      row.model.padEnd(widths.model),
      row.context.padEnd(widths.context),
      row.maxOut.padEnd(widths.maxOut),
      row.thinking.padEnd(widths.thinking),
      row.images.padEnd(widths.images)
    ].join("  ");
    console.log(line);
  }
}
export {
  listModels
};
