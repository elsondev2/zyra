import os from "node:os";
import path from "node:path";
import { createProductAnalytics } from "./client.mjs";
import { getZyraVersion } from "../version.mjs";

const analytics = createProductAnalytics({
  storageDirectory: path.resolve(process.env.ZYRA_STATE_DIR || path.join(os.homedir(), ".zyra"), "analytics"),
  source: "cli",
  appVersion: getZyraVersion(),
  platform: process.platform,
  architecture: process.arch,
});

export function initializeCliAnalytics() {
  return analytics.initialize();
}

export function captureCliEvent(event, properties = {}) {
  void analytics.capture(event, properties).catch(() => undefined);
}

export function getCliAnalyticsStatus() {
  return analytics.status();
}

export function shutdownCliAnalytics(timeoutMs = 750) {
  return analytics.shutdown({ timeoutMs });
}
