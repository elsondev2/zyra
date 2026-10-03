// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { applyBackgroundToLine, visibleWidth, wrapTextWithAnsi } from "../utils.js";
class Text {
  text;
  paddingX;
  // Left/right padding
  paddingY;
  // Top/bottom padding
  customBgFn;
  // Cache for rendered output
  cachedText;
  cachedWidth;
  cachedLines;
  constructor(text = "", paddingX = 1, paddingY = 1, customBgFn) {
    this.text = text;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
    this.customBgFn = customBgFn;
  }
  setText(text) {
    this.text = text;
    this.cachedText = void 0;
    this.cachedWidth = void 0;
    this.cachedLines = void 0;
  }
  setCustomBgFn(customBgFn) {
    this.customBgFn = customBgFn;
    this.cachedText = void 0;
    this.cachedWidth = void 0;
    this.cachedLines = void 0;
  }
  invalidate() {
    this.cachedText = void 0;
    this.cachedWidth = void 0;
    this.cachedLines = void 0;
  }
  render(width) {
    if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
      return this.cachedLines;
    }
    if (!this.text || this.text.trim() === "") {
      const result2 = [];
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = result2;
      return result2;
    }
    const normalizedText = this.text.replace(/\t/g, "   ");
    const paddingX = Math.min(this.paddingX, Math.max(0, Math.floor((width - 1) / 2)));
    const contentWidth = Math.max(1, width - paddingX * 2);
    const wrappedLines = wrapTextWithAnsi(normalizedText, contentWidth);
    const leftMargin = " ".repeat(paddingX);
    const rightMargin = " ".repeat(paddingX);
    const contentLines = [];
    for (const line of wrappedLines) {
      const lineWithMargins = leftMargin + line + rightMargin;
      if (this.customBgFn) {
        contentLines.push(applyBackgroundToLine(lineWithMargins, width, this.customBgFn));
      } else {
        const visibleLen = visibleWidth(lineWithMargins);
        const paddingNeeded = Math.max(0, width - visibleLen);
        contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
      }
    }
    const emptyLine = " ".repeat(width);
    const emptyLines = [];
    for (let i = 0; i < this.paddingY; i++) {
      const line = this.customBgFn ? applyBackgroundToLine(emptyLine, width, this.customBgFn) : emptyLine;
      emptyLines.push(line);
    }
    const result = [...emptyLines, ...contentLines, ...emptyLines];
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;
    return result.length > 0 ? result : [""];
  }
}
export {
  Text
};
