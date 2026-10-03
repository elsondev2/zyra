// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Container, Markdown, Spacer, Text } from "../../../../../terminal/src/index.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { createMarkdownTransform } from "./markdown-transform.js";
const OSC133_ZONE_START = "\x1B]133;A\x07";
const OSC133_ZONE_END = "\x1B]133;B\x07";
const OSC133_ZONE_FINAL = "\x1B]133;C\x07";
class AssistantMessageComponent extends Container {
  contentContainer;
  hideThinkingBlock;
  markdownTheme;
  hiddenThinkingLabel;
  outputPad;
  markdownTransformers;
  lastMessage;
  hasToolCalls = false;
  isStreaming = false;
  constructor(message, hideThinkingBlock = false, markdownTheme = getMarkdownTheme(), hiddenThinkingLabel = "Thinking...", outputPad = 1, markdownTransformers = []) {
    super();
    this.hideThinkingBlock = hideThinkingBlock;
    this.markdownTheme = markdownTheme;
    this.hiddenThinkingLabel = hiddenThinkingLabel;
    this.outputPad = outputPad;
    this.markdownTransformers = markdownTransformers;
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);
    if (message) {
      this.updateContent(message);
    }
  }
  invalidate() {
    super.invalidate();
    if (this.lastMessage) {
      this.updateContent(this.lastMessage);
    }
  }
  setHideThinkingBlock(hide) {
    this.hideThinkingBlock = hide;
    if (this.lastMessage) {
      this.updateContent(this.lastMessage);
    }
  }
  setHiddenThinkingLabel(label) {
    this.hiddenThinkingLabel = label;
    if (this.lastMessage) {
      this.updateContent(this.lastMessage);
    }
  }
  setOutputPad(padding) {
    this.outputPad = padding;
    if (this.lastMessage) {
      this.updateContent(this.lastMessage);
    }
  }
  render(width) {
    const lines = super.render(width);
    if (this.hasToolCalls || lines.length === 0) {
      return lines;
    }
    lines[0] = OSC133_ZONE_START + lines[0];
    lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
    return lines;
  }
  updateContent(message, isStreaming = this.isStreaming) {
    this.lastMessage = message;
    this.isStreaming = isStreaming;
    this.contentContainer.clear();
    const hasVisibleContent = message.content.some(
      (c) => c.type === "text" && c.text.trim() || c.type === "thinking" && c.thinking.trim()
    );
    if (hasVisibleContent) {
      this.contentContainer.addChild(new Spacer(1));
    }
    for (let i = 0; i < message.content.length; i++) {
      const content = message.content[i];
      if (content.type === "text" && content.text.trim()) {
        this.contentContainer.addChild(
          new Markdown(content.text.trim(), this.outputPad, 0, this.markdownTheme, void 0, {
            transform: createMarkdownTransform("assistant", this.isStreaming, this.markdownTransformers)
          })
        );
      } else if (content.type === "thinking") {
        const thinkingBlocks = [];
        for (; i < message.content.length; i++) {
          const thinkingContent = message.content[i];
          if (thinkingContent.type !== "thinking") {
            break;
          }
          const thinking = thinkingContent.thinking.trim();
          if (thinking) {
            thinkingBlocks.push(thinking);
          }
        }
        i--;
        if (thinkingBlocks.length === 0) {
          continue;
        }
        const hasVisibleContentAfter = message.content.slice(i + 1).some((c) => c.type === "text" && c.text.trim() || c.type === "thinking" && c.thinking.trim());
        if (this.hideThinkingBlock) {
          this.contentContainer.addChild(
            new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), this.outputPad, 0)
          );
        } else {
          this.contentContainer.addChild(
            new Markdown(
              thinkingBlocks.join("\n\n"),
              this.outputPad,
              0,
              this.markdownTheme,
              {
                color: (text) => theme.fg("thinkingText", text),
                italic: true
              },
              {
                transform: createMarkdownTransform(
                  "assistant-thinking",
                  this.isStreaming,
                  this.markdownTransformers
                )
              }
            )
          );
        }
        if (hasVisibleContentAfter) {
          this.contentContainer.addChild(new Spacer(1));
        }
      }
    }
    const hasToolCalls = message.content.some((c) => c.type === "toolCall");
    this.hasToolCalls = hasToolCalls;
    if (message.stopReason === "length") {
      this.contentContainer.addChild(new Spacer(1));
      this.contentContainer.addChild(
        new Text(theme.fg("error", "Response was truncated before completion."), this.outputPad, 0)
      );
    } else if (!hasToolCalls) {
      if (message.stopReason === "aborted") {
        const abortMessage = message.errorMessage && message.errorMessage !== "Request was aborted" ? message.errorMessage : "Operation aborted";
        this.contentContainer.addChild(new Spacer(1));
        this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), this.outputPad, 0));
      } else if (message.stopReason === "error") {
        const errorMsg = message.errorMessage || "Unknown error";
        this.contentContainer.addChild(new Spacer(1));
        this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), this.outputPad, 0));
      }
    }
  }
}
export {
  AssistantMessageComponent
};
