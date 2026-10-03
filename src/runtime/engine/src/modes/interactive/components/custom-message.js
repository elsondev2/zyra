// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Box, Container, Markdown, Spacer, Text } from "../../../../../terminal/src/index.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
class CustomMessageComponent extends Container {
  message;
  customRenderer;
  box;
  customComponent;
  markdownTheme;
  _expanded = false;
  outputPad;
  constructor(message, customRenderer, markdownTheme = getMarkdownTheme(), outputPad = 1) {
    super();
    this.message = message;
    this.customRenderer = customRenderer;
    this.markdownTheme = markdownTheme;
    this.outputPad = outputPad;
    this.addChild(new Spacer(1));
    this.box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    this.rebuild();
  }
  setExpanded(expanded) {
    if (this._expanded !== expanded) {
      this._expanded = expanded;
      this.rebuild();
    }
  }
  setOutputPad(outputPad) {
    if (this.outputPad !== outputPad) {
      this.outputPad = outputPad;
      this.rebuild();
    }
  }
  invalidate() {
    super.invalidate();
    this.rebuild();
  }
  rebuild() {
    if (this.customComponent) {
      this.removeChild(this.customComponent);
      this.customComponent = void 0;
    }
    this.removeChild(this.box);
    if (this.customRenderer) {
      try {
        const component = this.customRenderer(
          this.message,
          { expanded: this._expanded, outputPad: this.outputPad },
          theme
        );
        if (component) {
          this.customComponent = component;
          this.addChild(component);
          return;
        }
      } catch {
      }
    }
    this.addChild(this.box);
    this.box.clear();
    const label = theme.fg("customMessageLabel", `\x1B[1m[${this.message.customType}]\x1B[22m`);
    this.box.addChild(new Text(label, 0, 0));
    this.box.addChild(new Spacer(1));
    let text;
    if (typeof this.message.content === "string") {
      text = this.message.content;
    } else {
      text = this.message.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    }
    this.box.addChild(
      new Markdown(text, 0, 0, this.markdownTheme, {
        color: (text2) => theme.fg("customMessageText", text2)
      })
    );
  }
}
export {
  CustomMessageComponent
};
