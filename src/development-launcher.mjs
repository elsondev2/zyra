import os from "node:os";
import path from "node:path";

/** Match Desktop's development profile and namespace without loading Electron. */
export function developmentEnvironment({ root, cwd = process.cwd(), home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const suffix = String(env.ZYRA_DEV_INSTANCE_SUFFIX || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
  const profile = suffix ? `Zyra-dev-${suffix}` : "Zyra-dev";
  const appData = platform === "win32"
    ? env.APPDATA || path.join(home, "AppData", "Roaming")
    : platform === "darwin" ? path.join(home, "Library", "Application Support") : env.XDG_CONFIG_HOME || path.join(home, ".config");
  const result = {
    ...env,
    ZYRA_ROOT: path.resolve(root),
    ZYRA_CALLER_CWD: cwd,
    ZYRA_DATA_ROOT: home,
    ZYRA_STATE_DIR: path.join(appData, profile, "assistant", "agent-server"),
    ZYRA_AGENT_SERVER_CHANNEL: "desktop",
    ZYRA_DISTRIBUTION: "development"
  };
  delete result.ZYRA_STANDALONE;
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
