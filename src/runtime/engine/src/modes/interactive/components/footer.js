// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "../../../../../terminal/src/index.js";
import { areExperimentalFeaturesEnabled } from "../../../core/experimental.js";
import { addUsageToTotals, createUsageTotals } from "../../../core/usage-totals.js";
import { theme } from "../theme/theme.js";
function sanitizeStatusText(text) {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}
function formatTokens(count) {
  if (count < 1e3) return count.toString();
  if (count < 1e4) return `${(count / 1e3).toFixed(1)}k`;
  if (count < 1e6) return `${Math.round(count / 1e3)}k`;
  if (count < 1e7) return `${(count / 1e6).toFixed(1)}M`;
  return `${Math.round(count / 1e6)}M`;
}
function formatCwdForFooter(cwd, home) {
  if (!home) return cwd;
  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const isInsideHome = relativeToHome === "" || relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome);
  if (!isInsideHome) return cwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}
class FooterComponent {
  autoCompactEnabled = true;
  session;
  footerData;
  constructor(session, footerData) {
    this.session = session;
    this.footerData = footerData;
  }
  setSession(session) {
    this.session = session;
  }
  setAutoCompactEnabled(enabled) {
    this.autoCompactEnabled = enabled;
  }
  /**
   * No-op: git branch caching now handled by provider.
   * Kept for compatibility with existing call sites in interactive-mode.
   */
  invalidate() {
  }
  /**
   * Clean up resources.
   * Git watcher cleanup now handled by provider.
   */
  dispose() {
  }
  render(width) {
    const state = this.session.state;
    const usageTotals = createUsageTotals();
    let latestCacheHitRate;
    for (const entry of this.session.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        addUsageToTotals(usageTotals, entry.message.usage);
        const latestPromptTokens = entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
        latestCacheHitRate = latestPromptTokens > 0 ? entry.message.usage.cacheRead / latestPromptTokens * 100 : void 0;
      } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
        addUsageToTotals(usageTotals, entry.message.usage);
      } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
        addUsageToTotals(usageTotals, entry.usage);
      }
    }
    const contextUsage = this.session.getContextUsage();
    const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
    const contextPercentValue = contextUsage?.percent ?? 0;
    const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
    let pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
    const branch = this.footerData.getGitBranch();
    if (branch) {
      pwd = `${pwd} (${branch})`;
    }
    const sessionName = this.session.sessionManager.getSessionName();
    if (sessionName) {
      pwd = `${pwd} \u2022 ${sessionName}`;
    }
    const statsParts = [];
    if (usageTotals.input) statsParts.push(`\u2191${formatTokens(usageTotals.input)}`);
    if (usageTotals.output) statsParts.push(`\u2193${formatTokens(usageTotals.output)}`);
    if (usageTotals.cacheRead) statsParts.push(`R${formatTokens(usageTotals.cacheRead)}`);
    if (usageTotals.cacheWrite) statsParts.push(`W${formatTokens(usageTotals.cacheWrite)}`);
    if ((usageTotals.cacheRead > 0 || usageTotals.cacheWrite > 0) && latestCacheHitRate !== void 0) {
      statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
    }
    const usingSubscription = state.model ? state.model.provider === "kimi-coding" || this.session.modelRuntime.isUsingSubscription(state.model.provider) : false;
    if (usageTotals.cost || usingSubscription) {
      const costStr = `$${usageTotals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
      statsParts.push(costStr);
    }
    let contextPercentStr;
    const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";
    const contextPercentDisplay = contextPercent === "?" ? `?/${formatTokens(contextWindow)}${autoIndicator}` : `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
    if (contextPercentValue > 90) {
      contextPercentStr = theme.fg("error", contextPercentDisplay);
    } else if (contextPercentValue > 70) {
      contextPercentStr = theme.fg("warning", contextPercentDisplay);
    } else {
      contextPercentStr = contextPercentDisplay;
    }
    statsParts.push(contextPercentStr);
    if (areExperimentalFeaturesEnabled()) {
      statsParts.push(`${theme.fg("dim", "\u2022")} ${theme.bold(theme.fg("warning", "xp"))}`);
    }
    let statsLeft = statsParts.join(" ");
    const modelName = state.model?.id || "no-model";
    let statsLeftWidth = visibleWidth(statsLeft);
    if (statsLeftWidth > width) {
      statsLeft = truncateToWidth(statsLeft, width, "...");
      statsLeftWidth = visibleWidth(statsLeft);
    }
    const minPadding = 2;
    let rightSideWithoutProvider = modelName;
    if (state.model?.reasoning) {
      const thinkingLevel = state.thinkingLevel || "off";
      rightSideWithoutProvider = thinkingLevel === "off" ? `${modelName} \u2022 thinking off` : `${modelName} \u2022 ${thinkingLevel}`;
    }
    let rightSide = rightSideWithoutProvider;
    if (this.footerData.getAvailableProviderCount() > 1 && state.model) {
      rightSide = `(${state.model.provider}) ${rightSideWithoutProvider}`;
      if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {
        rightSide = rightSideWithoutProvider;
      }
    }
    const rightSideWidth = visibleWidth(rightSide);
    const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;
    let statsLine;
    if (totalNeeded <= width) {
      const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
      statsLine = statsLeft + padding + rightSide;
    } else {
      const availableForRight = width - statsLeftWidth - minPadding;
      if (availableForRight > 0) {
        const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
        const truncatedRightWidth = visibleWidth(truncatedRight);
        const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
        statsLine = statsLeft + padding + truncatedRight;
      } else {
        statsLine = statsLeft;
      }
    }
    const dimStatsLeft = theme.fg("dim", statsLeft);
    const remainder = statsLine.slice(statsLeft.length);
    const dimRemainder = theme.fg("dim", remainder);
    const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
    const lines = [pwdLine, dimStatsLeft + dimRemainder];
    const extensionStatuses = this.footerData.getExtensionStatuses();
    if (extensionStatuses.size > 0) {
      const sortedStatuses = Array.from(extensionStatuses.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => sanitizeStatusText(text));
      const statusLine = sortedStatuses.join(" ");
      lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
    }
    return lines;
  }
}
export {
  FooterComponent,
  formatCwdForFooter,
  formatTokens
};
