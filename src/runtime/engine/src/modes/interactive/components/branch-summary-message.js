// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Box, Markdown, Spacer, Text } from "../../../../../terminal/src/index.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { keyText } from "./keybinding-hints.js";
class BranchSummaryMessageComponent extends Box {
  expanded = false;
  message;
  markdownTheme;
  constructor(message, markdownTheme = getMarkdownTheme()) {
    super(1, 1, (t) => theme.bg("customMessageBg", t));
    this.message = message;
    this.markdownTheme = markdownTheme;
    this.updateDisplay();
  }
  setExpanded(expanded) {
    this.expanded = expanded;
    this.updateDisplay();
  }
  invalidate() {
    super.invalidate();
    this.updateDisplay();
  }
  updateDisplay() {
    this.clear();
    const label = theme.fg("customMessageLabel", `\x1B[1m[branch]\x1B[22m`);
    this.addChild(new Text(label, 0, 0));
    this.addChild(new Spacer(1));
    if (this.expanded) {
      const header = "**Branch Summary**\n\n";
      this.addChild(
        new Markdown(header + this.message.summary, 0, 0, this.markdownTheme, {
          color: (text) => theme.fg("customMessageText", text)
        })
      );
    } else {
      this.addChild(
        new Text(
          theme.fg("customMessageText", "Branch summary (") + theme.fg("dim", keyText("app.tools.expand")) + theme.fg("customMessageText", " to expand)"),
          0,
          0
        )
      );
    }
  }
}
export {
  BranchSummaryMessageComponent
};
