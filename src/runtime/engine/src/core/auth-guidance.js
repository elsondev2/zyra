// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { join } from "node:path";
import { getDocsPath } from "../config.js";
const UNKNOWN_PROVIDER = "unknown";
function getProviderLoginHelp() {
  return [
    "Use /login to log into a provider via OAuth or API key. See:",
    `  ${join(getDocsPath(), "providers.md")}`,
    `  ${join(getDocsPath(), "models.md")}`
  ].join("\n");
}
function formatNoModelsAvailableMessage() {
  return `No models available. ${getProviderLoginHelp()}`;
}
function formatNoModelSelectedMessage() {
  return `No model selected.

${getProviderLoginHelp()}

Then use /model to select a model.`;
}
function formatNoApiKeyFoundMessage(provider) {
  const providerDisplay = provider === UNKNOWN_PROVIDER ? "the selected model" : provider;
  return `No API key found for ${providerDisplay}.

${getProviderLoginHelp()}`;
}
export {
  formatNoApiKeyFoundMessage,
  formatNoModelSelectedMessage,
  formatNoModelsAvailableMessage,
  getProviderLoginHelp
};
