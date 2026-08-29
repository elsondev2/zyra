import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProductAnalytics } from "./client.mjs";
import { withBundledReleaseAnalyticsConfig } from "./release-config.mjs";
import { getZyraVersion } from "../version.mjs";

const analyticsStateDirectory = path.resolve(process.env.ZYRA_STATE_DIR || path.join(os.homedir(), ".zyra"), "analytics");
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const useReleaseConfig = process.env.ZYRA_ANALYTICS_USE_RELEASE_CONFIG === "1"
  || (process.env.ZYRA_ANALYTICS_USE_RELEASE_CONFIG !== "0" && !existsSync(path.join(repositoryRoot, ".git")));
const analyticsEnv = withBundledReleaseAnalyticsConfig(process.env, useReleaseConfig);

const analytics = createProductAnalytics({
  storageDirectory: analyticsStateDirectory,
  preferencePath: path.join(analyticsStateDirectory, "consent.json"),
  requireExplicitPreference: true,
  source: "cli",
  appVersion: getZyraVersion(),
  platform: process.platform,
  architecture: process.arch,
  env: analyticsEnv,
});

export function initializeCliAnalytics() {
  return analytics.initialize();
}

export function captureCliEvent(event, properties = {}) {
  void analytics.capture(event, properties).catch(() => undefined);
}

export function getCliAnalyticsStatus() {
  return analytics.refreshStatus();
}

export function updateCliAnalyticsEnabled(enabled) {
  return analytics.updateEnabled(enabled);
}

export function shutdownCliAnalytics(timeoutMs = 750) {
  return analytics.shutdown({ timeoutMs });
}
