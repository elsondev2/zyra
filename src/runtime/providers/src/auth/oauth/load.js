// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const importOAuthModule = (specifier) => {
  const runtimeSpecifier = import.meta.url.endsWith(".js") ? specifier.replace(/\.ts$/, ".js") : specifier;
  return import(runtimeSpecifier);
};
let bundledLoaders;
function registerBundledOAuthFlowLoaders(loaders) {
  bundledLoaders = loaders;
}
const loadAnthropicOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.anthropic();
  return (await importOAuthModule("./anthropic.js")).anthropicOAuth;
};
const loadOpenAICodexOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.openaiCodex();
  return (await importOAuthModule("./openai-codex.js")).openaiCodexOAuth;
};
const loadGitHubCopilotOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.githubCopilot();
  return (await importOAuthModule("./github-copilot.js")).githubCopilotOAuth;
};
const loadOpenRouterOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.openrouter();
  return (await importOAuthModule("./openrouter.js")).openRouterOAuth;
};
const loadKimiCodingOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.kimiCoding();
  return (await importOAuthModule("./kimi-coding.js")).kimiCodingOAuth;
};
const loadXaiOAuth = async () => {
  if (bundledLoaders) return bundledLoaders.xai();
  return (await importOAuthModule("./xai.js")).xaiOAuth;
};
const loadRadiusOAuth = async (options) => {
  if (bundledLoaders) return bundledLoaders.radius(options);
  return (await importOAuthModule("./radius.js")).createRadiusOAuth(options);
};
export {
  loadAnthropicOAuth,
  loadGitHubCopilotOAuth,
  loadKimiCodingOAuth,
  loadOpenAICodexOAuth,
  loadOpenRouterOAuth,
  loadRadiusOAuth,
  loadXaiOAuth,
  registerBundledOAuthFlowLoaders
};
