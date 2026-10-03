// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Editor } from "../../../../../terminal/src/index.js";
class CustomEditor extends Editor {
  keybindings;
  actionHandlers = /* @__PURE__ */ new Map();
  // Special handlers that can be dynamically replaced
  onEscape;
  onCtrlD;
  onPasteImage;
  /** Handler for extension-registered shortcuts. Returns true if handled. */
  onExtensionShortcut;
  constructor(tui, theme, keybindings, options) {
    super(tui, theme, options);
    this.keybindings = keybindings;
  }
  /**
   * Register a handler for an app action.
   */
  onAction(action, handler) {
    this.actionHandlers.set(action, handler);
  }
  handleInput(data) {
    if (this.onExtensionShortcut?.(data)) {
      return;
    }
    if (this.keybindings.matches(data, "app.clipboard.pasteImage")) {
      this.onPasteImage?.();
      return;
    }
    if (this.keybindings.matches(data, "app.interrupt")) {
      if (!this.isShowingAutocomplete()) {
        const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt");
        if (handler) {
          handler();
          return;
        }
      }
      super.handleInput(data);
      return;
    }
    if (this.keybindings.matches(data, "app.exit")) {
      if (this.getText().length === 0) {
        const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
        if (handler) handler();
        return;
      }
    }
    if (this.keybindings.matches(data, "tui.editor.historyPrevious") || this.keybindings.matches(data, "tui.editor.historyNext")) {
      super.handleInput(data);
      return;
    }
    for (const [action, handler] of this.actionHandlers) {
      if (action !== "app.interrupt" && action !== "app.exit" && this.keybindings.matches(data, action)) {
        handler();
        return;
      }
    }
    super.handleInput(data);
  }
}
export {
  CustomEditor
};
