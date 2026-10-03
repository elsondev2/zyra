/** Process-local OpenCode hook. Zyra owns MCP discovery, gates and lifetimes. */
export default async function zyraHarnessConfigPlugin() {
  return { async config(config) {
    // These native MCP tools are outside the reviewed managed tool pipe. Keep
    // their configured entries intact while preventing duplicate connections
    // in Zyra-owned serves; never write the user's native configuration.
    if (!config.mcp || typeof config.mcp !== 'object' || Array.isArray(config.mcp)) return;
    config.mcp = Object.fromEntries(Object.entries(config.mcp).map(([name, entry]) =>
      [name, entry && typeof entry === 'object' ? { ...entry, enabled: false } : entry]));
  } };
}
