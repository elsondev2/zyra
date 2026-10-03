// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const CLOUDFLARE_API_KEY = "CLOUDFLARE_API_KEY";
const CLOUDFLARE_ACCOUNT_ID = "CLOUDFLARE_ACCOUNT_ID";
const CLOUDFLARE_GATEWAY_ID = "CLOUDFLARE_GATEWAY_ID";
async function resolveValue(name, ctx, credential, signal) {
  const fromCredential = credential ? name === CLOUDFLARE_API_KEY ? credential.key : credential.env?.[name] : void 0;
  if (fromCredential !== void 0) return fromCredential;
  signal.throwIfAborted();
  const value = await ctx.env(name);
  signal.throwIfAborted();
  return value;
}
async function resolveCloudflareEnv(kind, ctx, credential, signal) {
  const apiKey = await resolveValue(CLOUDFLARE_API_KEY, ctx, credential, signal);
  const accountId = await resolveValue(CLOUDFLARE_ACCOUNT_ID, ctx, credential, signal);
  const gatewayId = kind === "ai-gateway" ? await resolveValue(CLOUDFLARE_GATEWAY_ID, ctx, credential, signal) : void 0;
  if (!apiKey || !accountId || kind === "ai-gateway" && !gatewayId) return void 0;
  return {
    apiKey,
    env: {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      ...gatewayId ? { CLOUDFLARE_GATEWAY_ID: gatewayId } : {}
    },
    source: credential ? "stored credential" : CLOUDFLARE_API_KEY
  };
}
function cloudflareWorkersAIAuth() {
  return {
    name: "Cloudflare API key",
    login: async (interaction) => {
      const key = await interaction.prompt({ type: "secret", message: "Enter Cloudflare API key" });
      const accountId = await interaction.prompt({ type: "text", message: "Enter Cloudflare account ID" });
      return { type: "api_key", key, env: { CLOUDFLARE_ACCOUNT_ID: accountId } };
    },
    resolve: async ({ ctx, credential, signal }) => {
      const resolved = await resolveCloudflareEnv("workers-ai", ctx, credential, signal);
      if (!resolved) return void 0;
      return {
        auth: { apiKey: resolved.apiKey },
        env: resolved.env,
        source: resolved.source
      };
    }
  };
}
function cloudflareAIGatewayAuth() {
  return {
    name: "Cloudflare API key",
    login: async (interaction) => {
      const key = await interaction.prompt({ type: "secret", message: "Enter Cloudflare API key" });
      const accountId = await interaction.prompt({ type: "text", message: "Enter Cloudflare account ID" });
      const gatewayId = await interaction.prompt({ type: "text", message: "Enter Cloudflare AI Gateway ID" });
      return {
        type: "api_key",
        key,
        env: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_GATEWAY_ID: gatewayId }
      };
    },
    resolve: async ({ ctx, credential, signal }) => {
      const resolved = await resolveCloudflareEnv("ai-gateway", ctx, credential, signal);
      if (!resolved) return void 0;
      return {
        auth: {
          headers: {
            "cf-aig-authorization": `Bearer ${resolved.apiKey}`,
            Authorization: null,
            "x-api-key": null
          }
        },
        env: resolved.env,
        source: resolved.source
      };
    }
  };
}
export {
  cloudflareAIGatewayAuth,
  cloudflareWorkersAIAuth
};
