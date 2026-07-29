import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readClipboardImage } from "../../clipboard-image.mjs";
import { buildTerminalTheme } from "../../terminal-theme.mjs";
import {
  buildEditorInputLayout,
  cursorIndexAtVisualPosition,
  nextGraphemeBoundary,
  nextWordBoundary,
  previousGraphemeBoundary,
  previousWordBoundary,
} from "../editor-input-layout.mjs";
import {
  bold,
  fgReset,
  inverse,
  normalIntensity,
  padToVisibleWidth,
  reset,
  truncatePlain,
  visibleWidth,
  wrapPlain,
} from "../render-utils.mjs";

const fallbackTheme = buildTerminalTheme();
const inputPlaceholders = loadJson("../../input-placeholders.json", { placeholders: ["message..."] }).placeholders ?? ["message..."];
const firstInstallPlaceholder = "...noted, type it";
const placeholderPreferenceFile = path.join(".zyra", "preferences.json");
const placeholderFirstSeenKey = "placeholderFirstSeenAt";
const placeholderDiversityDelayMs = 14 * 24 * 60 * 60 * 1000;
const pastedTextThreshold = 80;
const pastedReturnGraceMs = 80;

export class EditorComponent {
  constructor(options = {}) {
    this.key = "editor";
    this.theme = buildTerminalTheme(options.theme);
    this.options = options;
    this.placeholderOptions = { project: options.project };
    this.buffer = "";
    this.cursorIndex = 0;
    this.preferredCursorColumn = undefined;
    this.lastRenderWidth = undefined;
    this.pastedBlocks = [];
    this.pastedImages = [];
    this.bracketedPasteText = null;
    this.pendingInsertedText = "";
    this.pendingInsertTimer = undefined;
    this.lastDeferredTextInputAt = 0;
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.cachedSuggestionText = undefined;
    this.cachedSuggestions = [];
    this.placeholderText = pickPlaceholder("", this.placeholderOptions);
    this.inputHistory = [];
    this.inputHistoryIndex = null;
    this.inputHistoryDraft = "";
    this.hasTranscript = false;
    this.waiting = false;
    this.exitingForRestart = false;
    this.inputLocked = false;
    this.busyFrame = 0;
    this.starterRecommendations = normalizeStarterRecommendations(options.starterRecommendations);
    this.starterRecommendationDismissed = false;
    this.insertedStarterPrompt = "";
    this.imagePastePromises = new Set();
    this.imagePasteSequence = 0;
    this.onSubmit = options.onSubmit ?? (async () => false);
    this.onExit = options.onExit ?? (() => {});
  }

  setHost(host) {
    this.host = host;
  }

  setTheme(theme) {
    this.theme = buildTerminalTheme(theme);
    this.invalidateInput();
  }

  setWaiting(value) {
    this.waiting = Boolean(value);
    this.invalidateInput();
  }

  setInputLocked(value) {
    this.inputLocked = Boolean(value);
  }

  setText(text) {
    this.clearPendingTextInput();
    this.buffer = String(text ?? "");
    this.cursorIndex = this.buffer.length;
    this.preferredCursorColumn = undefined;
    this.pastedBlocks = [];
    this.pastedImages = [];
    this.imagePasteSequence = 0;
    this.bracketedPasteText = null;
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.clearSuggestionCache();
    this.inputHistoryIndex = null;
    this.invalidateInput({ force: true });
  }

  getText() {
    return this.buffer;
  }

  resetSession() {
    this.clearPendingTextInput();
    this.buffer = "";
    this.cursorIndex = 0;
    this.preferredCursorColumn = undefined;
    this.pastedBlocks = [];
    this.pastedImages = [];
    this.bracketedPasteText = null;
    this.pendingInsertedText = "";
    this.lastDeferredTextInputAt = 0;
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.inputHistoryIndex = null;
    this.inputHistoryDraft = "";
    this.hasTranscript = false;
    this.waiting = false;
    this.exitingForRestart = false;
    this.busyFrame = 0;
    this.starterRecommendationDismissed = false;
    this.insertedStarterPrompt = "";
    this.imagePastePromises.clear();
    this.imagePasteSequence = 0;
    this.invalidateInput({ force: true });
  }

  tickBusy() {
    this.busyFrame += 1;
    this.invalidateInput();
  }

  suggestionsFor(text) {
    if (this.completedText && text === this.completedText) return [];
    if (this.suppressSuggestionsFor && text === this.suppressSuggestionsFor) return [];
    if (text === this.cachedSuggestionText) return this.cachedSuggestions;
    const suggestions = this.options.suggestions?.(text) ?? [];
    this.cachedSuggestionText = text;
    this.cachedSuggestions = suggestions;
    return suggestions;
  }

  render(width) {
    this.lastRenderWidth = Math.max(3, Number(width) || 80);
    const lines = [];
    const turnActive = Boolean(this.options.isRunActive?.() || this.options.getBusy?.() || this.waiting);
    const isBusy = turnActive && !this.options.suppressWorking?.();
    const activityLabel = this.options.getActivityLabel?.() || (this.waiting ? "starting" : "working");
    const showStarterRecommendations = this.shouldShowStarterRecommendations();
    if (this.hasTranscript && !isBusy) lines.push("");
    if (showStarterRecommendations) lines.push(renderStarterRecommendationLine(this.starterRecommendations[0], width, this.theme));
    if (isBusy) {
      if (this.hasTranscript) lines.push("");
      lines.push(renderInputActivityLine(this.busyFrame, this.theme, activityLabel));
      lines.push("");
    }

    const queuedMessages = normalizeQueuedMessages(this.options.getQueuedMessages?.());
    if (queuedMessages.steering.length > 0 || queuedMessages.followUp.length > 0) {
      lines.push(...renderQueuedMessages(queuedMessages, width, this.theme));
      lines.push("");
    }

    const prompt = `${this.theme.primary}>${fgReset} `;
    this.clampCursorIndex();
    const displayText = displayTextFor(this.buffer, this.pastedBlocks);
    const displayCursorIndex = displayCursorIndexFor(this.buffer, this.pastedBlocks, this.cursorIndex);
    const editor = renderEditorLines({ prompt, text: displayText, cursorIndex: displayCursorIndex, placeholder: this.placeholderText }, width, this.theme);
    this.cursor = {
      row: lines.length + 1 + editor.cursor.row,
      col: editor.cursor.col,
    };
    const editorLines = editor.lines.map((line) => styleAttachmentLabels(line, this.theme, fgReset));
    const rail = renderInputRail(width, this.theme);
    lines.push(rail);
    lines.push(...editorLines);
    lines.push(rail);

    const suggestions = this.suggestionsFor(this.buffer);
    if (this.selectedIndex >= suggestions.length) this.selectedIndex = 0;
    this.alignSelectedSuggestion(suggestions);
    this.notifySelectedSuggestion(suggestions[this.selectedIndex]);
    const maxVisible = this.options.maxSuggestions ?? 10;
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), suggestions.length - maxVisible));
    const endIndex = Math.min(startIndex + maxVisible, suggestions.length);
    for (let i = startIndex; i < endIndex; i += 1) {
      const item = suggestions[i];
      const marker = i === this.selectedIndex ? `${inverse}>${reset}` : `${this.theme.muted}-${reset}`;
      const label = i === this.selectedIndex ? `${inverse}${item.label}${reset}` : `${this.theme.primary}${item.label}${reset}`;
      const descriptionStyle = this.theme.menuDescriptionFg ?? this.theme.muted;
      const left = `${marker} ${label} ${descriptionStyle}${item.description ?? ""}${reset}`;
      lines.push(alignMenuPreview(left, item.preview, width, this.theme));
    }
    if (startIndex > 0 || endIndex < suggestions.length) {
      lines.push(`${this.theme.muted}(${this.selectedIndex + 1}/${suggestions.length})${reset}`);
    }

    const statusLine = this.options.statusLine?.(width, { activity: "" });
    if (statusLine) lines.push("", statusLine);
    return lines;
  }

  cursorPosition(width) {
    if (!this.cursor) this.render(width);
    return this.cursor ?? null;
  }

  async handleKeypress(str, key) {
    const turnActive = Boolean(this.options.isRunActive?.() || this.options.getBusy?.() || this.waiting);
    if (this.inputLocked) {
      if (key?.ctrl && key.name === "c") {
        this.onExit(130);
      }
      return;
    }
    if (key?.name === "paste-start") {
      this.beginBracketedPaste();
      return;
    }
    if (this.bracketedPasteText !== null) {
      this.collectBracketedPaste(str, key);
      return;
    }
    const isPlainTextInput = str && !key?.ctrl && !key?.meta && !key?.alt && (str >= " " || /\r|\n/.test(str));
    if (!isPlainTextInput) this.flushPendingTextInput();
    if (key?.ctrl && key.name === "c") {
      this.onExit(130);
      return;
    }
    const suggestions = this.suggestionsFor(this.buffer);
    if (this.handleScrollKey(key, suggestions)) return;
    if ((key?.meta || key?.alt) && key?.name === "up") {
      const restored = await this.options.onRestoreQueued?.(this.buffer);
      if (typeof restored === "string") this.setText(restored);
      return;
    }
    const starterPromptIsInserted = this.insertedStarterPrompt && this.buffer.trim() === this.insertedStarterPrompt.trim();
    if (key?.name === "down" && (this.shouldShowStarterRecommendations() || starterPromptIsInserted)) return this.clearStarterRecommendation();
    if (key?.name === "up" && this.shouldShowStarterRecommendations()) return this.insertStarterRecommendation();
    if (key?.name === "down" && suggestions.length > 0) {
      this.selectedIndex = (this.selectedIndex + 1) % suggestions.length;
      this.selectionDirty = true;
      this.invalidateInput();
      return;
    }
    if (key?.name === "up" && suggestions.length > 0) {
      this.selectedIndex = (this.selectedIndex - 1 + suggestions.length) % suggestions.length;
      this.selectionDirty = true;
      this.invalidateInput();
      return;
    }
    if (key?.name === "up") {
      if (this.moveCursorVertical(-1)) return;
      if (this.recallInputHistory(-1)) this.invalidateInput();
      return;
    }
    if (key?.name === "down") {
      if (this.moveCursorVertical(1)) return;
      if (this.recallInputHistory(1)) this.invalidateInput();
      return;
    }
    const rightAcceptsSuggestion = key?.name === "right"
      && !key?.ctrl && !key?.meta && !key?.alt
      && this.cursorIndex === this.buffer.length;
    if ((key?.name === "tab" || rightAcceptsSuggestion) && suggestions.length > 0) {
      this.completeSelection();
      return;
    }
    if (key?.ctrl && key?.name === "a") {
      this.moveCursorTo(0);
      return;
    }
    if (key?.ctrl && key?.name === "e") {
      this.moveCursorTo(this.buffer.length);
      return;
    }
    if ((key?.alt || key?.meta) && key?.name === "b") {
      this.moveCursorWord(-1);
      return;
    }
    if ((key?.alt || key?.meta) && key?.name === "f") {
      this.moveCursorWord(1);
      return;
    }
    if (key?.name === "left" || (key?.ctrl && key?.name === "b")) {
      if ((key?.ctrl || key?.meta || key?.alt) && key?.name === "left") this.moveCursorWord(-1);
      else this.moveCursor(-1);
      return;
    }
    if (key?.name === "right" || (key?.ctrl && key?.name === "f")) {
      if ((key?.ctrl || key?.meta || key?.alt) && key?.name === "right") this.moveCursorWord(1);
      else this.moveCursor(1);
      return;
    }
    if (key?.name === "home") {
      if (key?.ctrl || key?.meta) this.moveCursorTo(0);
      else this.moveCursorToVisualBoundary("start");
      return;
    }
    if (key?.name === "end") {
      if (key?.ctrl || key?.meta) this.moveCursorTo(this.buffer.length);
      else this.moveCursorToVisualBoundary("end");
      return;
    }
    if ((key?.ctrl && key?.name === "w") || ((key?.alt || key?.meta) && key?.name === "backspace")) {
      this.deleteInputRange(previousWordBoundary(this.buffer, this.cursorIndex), this.cursorIndex);
      return;
    }
    if ((key?.alt || key?.meta) && ["d", "delete"].includes(key?.name)) {
      this.deleteInputRange(this.cursorIndex, nextWordBoundary(this.buffer, this.cursorIndex));
      return;
    }
    if (key?.ctrl && key?.name === "u") {
      this.deleteInputRange(0, this.cursorIndex);
      return;
    }
    if (key?.ctrl && key?.name === "k") {
      this.deleteInputRange(this.cursorIndex, this.buffer.length);
      return;
    }
    if ((key?.name === "return" && key?.shift) || (key?.ctrl && ["j", "return"].includes(key?.name))) {
      this.flushPendingTextInput();
      this.insertTextInput("\n", { trackPaste: false });
      return;
    }
    if (key?.name === "return") {
      if (this.shouldTreatReturnAsPastedText(str)) {
        this.queueTextInput(str || "\n");
        return;
      }
      const delivery = (key?.meta || key?.alt) ? "queue" : undefined;
      if (suggestions.length > 0 && !delivery) {
        const completed = this.completeSelection({ submitOnEnter: true });
        if (typeof completed === "string" && completed.length > 0) {
          const shouldExit = await this.submit(completed);
          if (shouldExit) this.onExit(shouldExit === "restart" ? "restart" : 0);
        }
        return;
      }
      const text = this.buffer;
      if (!text.trim() && this.pastedImages.length === 0 && this.imagePastePromises.size === 0) {
        this.invalidateInput();
        return;
      }
      const shouldExit = await this.submit(text, { delivery });
      if (shouldExit) this.onExit(shouldExit === "restart" ? "restart" : 0);
      return;
    }
    if (key?.name === "backspace" || (key?.ctrl && key?.name === "h")) {
      const removed = removeInputUnitBeforeCursor(this.buffer, this.cursorIndex, this.pastedBlocks, this.pastedImages);
      this.buffer = removed.buffer;
      this.cursorIndex = removed.cursorIndex;
      this.preferredCursorColumn = undefined;
      this.insertedStarterPrompt = "";
      this.pastedBlocks = removed.blocks;
      this.pastedImages = removed.images;
      this.completedText = "";
      this.suppressSuggestionsFor = "";
      this.selectedIndex = 0;
      this.selectionDirty = false;
      this.inputHistoryIndex = null;
      this.clearSuggestionCache();
      this.invalidateInput();
      return;
    }
    if (key?.name === "delete" || (key?.ctrl && key?.name === "d")) {
      if (!this.buffer && key?.ctrl && key?.name === "d") {
        this.onExit(0);
        return;
      }
      const removed = removeInputUnitAfterCursor(this.buffer, this.cursorIndex, this.pastedBlocks, this.pastedImages);
      this.buffer = removed.buffer;
      this.cursorIndex = removed.cursorIndex;
      this.preferredCursorColumn = undefined;
      this.insertedStarterPrompt = "";
      this.pastedBlocks = removed.blocks;
      this.pastedImages = removed.images;
      this.completedText = "";
      this.suppressSuggestionsFor = "";
      this.selectedIndex = 0;
      this.selectionDirty = false;
      this.inputHistoryIndex = null;
      this.clearSuggestionCache();
      this.invalidateInput();
      return;
    }
    if (key?.name === "escape") {
      if (turnActive) {
        const restored = await this.options.onAbortQueued?.(this.buffer);
        if (typeof restored === "string") this.setText(restored);
        return;
      }
      this.buffer = "";
      this.cursorIndex = 0;
      this.preferredCursorColumn = undefined;
      this.insertedStarterPrompt = "";
      this.pastedBlocks = [];
      this.pastedImages = [];
      this.completedText = "";
      this.suppressSuggestionsFor = "";
      this.selectedIndex = 0;
      this.selectionDirty = false;
      this.inputHistoryIndex = null;
      this.clearSuggestionCache();
      this.invalidateInput();
      return;
    }
    if ((key?.ctrl || key?.meta || key?.alt) && key?.name === "v") {
      this.queueImagePaste();
      return;
    }
    if (isPlainTextInput) this.queueTextInput(str);
  }

  clampCursorIndex() {
    this.cursorIndex = Math.max(0, Math.min(this.buffer.length, Number(this.cursorIndex) || 0));
    const containingBlock = this.pastedBlocks.find((block) => this.cursorIndex > block.start && this.cursorIndex < block.end);
    if (containingBlock) this.cursorIndex = containingBlock.end;
  }

  moveCursor(direction) {
    this.clampCursorIndex();
    if (direction < 0) {
      const previousBlock = this.pastedBlocks.find((block) => block.end === this.cursorIndex || (this.cursorIndex > block.start && this.cursorIndex < block.end));
      this.cursorIndex = previousBlock ? previousBlock.start : previousGraphemeBoundary(this.buffer, this.cursorIndex);
    } else if (direction > 0) {
      const nextBlock = this.pastedBlocks.find((block) => block.start === this.cursorIndex || (this.cursorIndex > block.start && this.cursorIndex < block.end));
      this.cursorIndex = nextBlock ? nextBlock.end : nextGraphemeBoundary(this.buffer, this.cursorIndex);
    }
    this.preferredCursorColumn = undefined;
    this.clearSuggestionCache();
    this.invalidateInput();
  }

  moveCursorWord(direction) {
    this.clampCursorIndex();
    let nextIndex = direction < 0
      ? previousWordBoundary(this.buffer, this.cursorIndex)
      : nextWordBoundary(this.buffer, this.cursorIndex);
    const containingBlock = this.pastedBlocks.find((block) => nextIndex > block.start && nextIndex < block.end);
    if (containingBlock) nextIndex = direction < 0 ? containingBlock.start : containingBlock.end;
    this.moveCursorTo(nextIndex);
  }

  moveCursorVertical(direction) {
    const navigation = this.editorNavigationContext();
    const current = navigation.layout.positions[navigation.displayCursorIndex] ?? { row: 0, col: 0 };
    const targetRow = current.row + direction;
    if (targetRow < 0 || targetRow >= navigation.layout.rows.length) return false;
    this.preferredCursorColumn ??= current.col;
    const displayIndex = cursorIndexAtVisualPosition(navigation.layout, targetRow, this.preferredCursorColumn);
    const rawIndex = rawCursorIndexForDisplay(this.buffer, this.pastedBlocks, displayIndex);
    this.moveCursorTo(rawIndex, { preservePreferredColumn: true });
    return true;
  }

  moveCursorToVisualBoundary(edge) {
    const navigation = this.editorNavigationContext();
    const current = navigation.layout.positions[navigation.displayCursorIndex] ?? { row: 0, col: 0 };
    const targetCol = edge === "end" ? visibleWidth(navigation.layout.rows[current.row] ?? "") : 0;
    const displayIndex = cursorIndexAtVisualPosition(navigation.layout, current.row, targetCol, { edge });
    const rawIndex = rawCursorIndexForDisplay(this.buffer, this.pastedBlocks, displayIndex);
    this.moveCursorTo(rawIndex);
  }

  editorNavigationContext() {
    this.clampCursorIndex();
    const width = Math.max(3, Number(this.lastRenderWidth ?? this.host?.width?.() ?? 80) || 80);
    const promptWidth = 2;
    const displayText = displayTextFor(this.buffer, this.pastedBlocks);
    const displayCursorIndex = displayCursorIndexFor(this.buffer, this.pastedBlocks, this.cursorIndex);
    return {
      displayCursorIndex,
      layout: buildEditorInputLayout(displayText, Math.max(1, width - promptWidth)),
    };
  }

  moveCursorTo(index, options = {}) {
    this.cursorIndex = Math.max(0, Math.min(this.buffer.length, Number(index) || 0));
    this.clampCursorIndex();
    if (!options.preservePreferredColumn) this.preferredCursorColumn = undefined;
    this.clearSuggestionCache();
    this.invalidateInput();
  }

  deleteInputRange(start, end) {
    const removed = removeInputRange(this.buffer, start, end, this.pastedBlocks, this.pastedImages);
    this.buffer = removed.buffer;
    this.cursorIndex = removed.cursorIndex;
    this.preferredCursorColumn = undefined;
    this.insertedStarterPrompt = "";
    this.pastedBlocks = removed.blocks;
    this.pastedImages = removed.images;
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.clearSuggestionCache();
    this.invalidateInput();
  }

  handleScrollKey(key, suggestions = []) {
    if (!key?.name || !this.host?.canScroll?.()) return false;
    const canUseArrowForScroll = !this.buffer.trim() && suggestions.length === 0 && this.pastedBlocks.length === 0 && this.pastedImages.length === 0 && this.imagePastePromises.size === 0;
    const page = Math.max(4, Math.floor((this.host.height?.() ?? 24) / 2));

    if (key.name === "pageup" || key.name === "prior") return this.host.scrollBy(page);
    if (key.name === "pagedown" || key.name === "next") return this.host.scrollBy(-page);
    if (key.name === "home" && (key.ctrl || canUseArrowForScroll)) return this.host.scrollToTop();
    if (key.name === "end" && (key.ctrl || canUseArrowForScroll)) return this.host.scrollToBottom();
    if (key.name === "up" && canUseArrowForScroll) return this.host.scrollBy(3);
    if (key.name === "down" && canUseArrowForScroll) return this.host.scrollBy(-3);

    return false;
  }

  async submit(text, submitOptions = {}) {
    let submittedText = String(text ?? "");
    if (this.imagePastePromises.size > 0) {
      this.waiting = true;
      this.invalidateInput();
      while (this.imagePastePromises.size > 0) {
        await Promise.allSettled([...this.imagePastePromises]);
      }
      submittedText = this.buffer;
    }
    const displayText = displayTextFor(submittedText, this.pastedBlocks).trim();
    const promptText = submissionTextFor(submittedText, this.pastedBlocks).trim();
    const imageAttachments = this.pastedImages
      .slice()
      .sort((left, right) => left.index - right.index)
      .map(({ index, width, height }) => ({ index, width, height }));
    const hasImages = imageAttachments.length > 0;
    if (!promptText && !hasImages) {
      this.waiting = false;
      this.invalidateInput();
      return false;
    }
    const submission = hasImages || displayText !== promptText
      ? {
          text: promptText,
          displayText,
          images: this.pastedImages.slice().sort((left, right) => left.index - right.index).map((item) => item.image),
          imageAttachments,
        }
      : promptText;
    const shouldEcho = this.options.shouldEchoUserMessage?.(submission, submitOptions) !== false;
    if (shouldEcho) this.options.onUserMessage?.(promptText, { displayText, imageAttachments });
    this.rememberInputHistory(promptText);
    this.hasTranscript = true;
    this.buffer = "";
    this.cursorIndex = 0;
    this.preferredCursorColumn = undefined;
    this.pastedBlocks = [];
    this.pastedImages = [];
    this.imagePasteSequence = 0;
    this.placeholderText = pickPlaceholder(this.placeholderText, this.placeholderOptions);
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.inputHistoryIndex = null;
    this.waiting = hasImages || shouldShowWaitingFor(promptText);
    this.invalidateInput({ force: true });
    try {
      const result = await this.onSubmit(submitOptions.delivery ? { ...(typeof submission === "string" ? { text: submission } : submission), delivery: submitOptions.delivery } : submission);
      if (result === "restart") {
        this.exitingForRestart = true;
        return result;
      }
      return result;
    } finally {
      this.waiting = false;
      if (!this.exitingForRestart) this.invalidateInput();
    }
  }

  completeSelection(completionOptions = {}) {
    const suggestions = this.suggestionsFor(this.buffer);
    if (suggestions.length === 0) return false;
    const selected = suggestions[this.selectedIndex];
    const next = this.options.applySuggestion?.(this.buffer, selected) ?? selected?.value;
    if (!next) return false;
    this.buffer = next;
    this.cursorIndex = this.buffer.length;
    this.preferredCursorColumn = undefined;
    this.completedText = next.endsWith(" ") || (selected.kind === "file-mention" && selected.isDirectory) ? "" : next;
    this.suppressSuggestionsFor = selected.kind === "custom-model" ? next : "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.invalidateInput();
    if (completionOptions.submitOnEnter && selected.submitOnEnter) return next.trim();
    return false;
  }

  shouldShowStarterRecommendations() {
    return !this.starterRecommendationDismissed && !this.hasTranscript && !this.waiting && !this.buffer.trim() && this.starterRecommendations.length > 0;
  }

  insertStarterRecommendation() {
    const selected = this.starterRecommendations[0];
    if (!selected?.prompt) return false;
    this.buffer = selected.prompt;
    this.cursorIndex = this.buffer.length;
    this.preferredCursorColumn = undefined;
    this.insertedStarterPrompt = selected.prompt;
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.invalidateInput();
    return true;
  }

  clearStarterRecommendation() {
    if (this.insertedStarterPrompt && this.buffer.trim() === this.insertedStarterPrompt.trim()) {
      this.buffer = "";
      this.cursorIndex = 0;
    }
    this.starterRecommendationDismissed = true;
    this.insertedStarterPrompt = "";
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.invalidateInput();
  }

  beginBracketedPaste() {
    this.flushPendingTextInput();
    this.bracketedPasteText = "";
  }

  collectBracketedPaste(str, key) {
    if (key?.name === "paste-end") {
      const pastedText = this.bracketedPasteText;
      this.bracketedPasteText = null;
      if (pastedText) this.insertTextInput(pastedText);
      return;
    }
    if (typeof str === "string") this.bracketedPasteText += str;
  }

  queueTextInput(str) {
    if (!shouldDeferTextInput(str) && !this.pendingInsertedText) {
      this.insertTextInput(str);
      return;
    }
    this.lastDeferredTextInputAt = Date.now();
    this.pendingInsertedText += str;
    if (this.pendingInsertTimer) clearTimeout(this.pendingInsertTimer);
    this.pendingInsertTimer = setTimeout(() => this.flushPendingTextInput(), 18);
  }

  shouldTreatReturnAsPastedText(str) {
    if (str !== "\r" && str !== "\n") return false;
    if (this.pendingInsertedText) return true;
    return Date.now() - this.lastDeferredTextInputAt <= pastedReturnGraceMs;
  }

  flushPendingTextInput() {
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = undefined;
    }
    if (!this.pendingInsertedText) return;
    const str = this.pendingInsertedText;
    this.pendingInsertedText = "";
    this.lastDeferredTextInputAt = Date.now();
    this.insertTextInput(str);
  }

  clearPendingTextInput() {
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = undefined;
    }
    this.pendingInsertedText = "";
    this.lastDeferredTextInputAt = 0;
  }

  insertTextInput(str, options = {}) {
    this.clampCursorIndex();
    const start = this.cursorIndex;
    const value = String(str ?? "");
    this.buffer = this.buffer.slice(0, start) + value + this.buffer.slice(start);
    this.cursorIndex = start + value.length;
    this.preferredCursorColumn = undefined;
    this.pastedBlocks = shiftBlocksForInsert(this.pastedBlocks, start, value.length);
    this.insertedStarterPrompt = "";
    if (options.trackPaste !== false && isLikelyPaste(value)) {
      this.pastedBlocks.push({
        id: `paste-${Date.now()}-${this.pastedBlocks.length + 1}`,
        type: "text",
        start,
        end: this.cursorIndex,
        label: `[Pasted Content ${value.length.toLocaleString("en-US")} chars]`,
      });
    }
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.invalidateInput();
  }

  queueImagePaste() {
    this.imagePasteSequence += 1;
    const index = this.imagePasteSequence;
    const id = `image-${Date.now()}-${index}`;
    this.clampCursorIndex();
    const prefix = this.buffer && this.cursorIndex > 0 && !/\s$/.test(this.buffer.slice(0, this.cursorIndex)) ? " " : "";
    const start = this.cursorIndex;
    const label = `${prefix}${formatImagePasteLabel(index, undefined, undefined, { pending: true })}`;
    this.buffer = this.buffer.slice(0, start) + label + this.buffer.slice(start);
    this.cursorIndex = start + label.length;
    this.pastedBlocks = shiftBlocksForInsert(this.pastedBlocks, start, label.length);
    this.pastedBlocks.push({ id, type: "image", index, prefix, start, end: this.cursorIndex, label });
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    this.inputHistoryIndex = null;
    this.invalidateInput();

    const reader = this.options.readClipboardImage ?? readClipboardImage;
    const pastePromise = Promise.resolve()
      .then(() => reader())
      .then((pastedImage) => {
        const block = this.pastedBlocks.find((item) => item.id === id);
        if (!block) return;
        if (!pastedImage?.image) {
          const removed = replacePastedBlock(this.buffer, this.cursorIndex, this.pastedBlocks, id, "");
          this.buffer = removed.buffer;
          this.cursorIndex = removed.cursorIndex;
          this.pastedBlocks = removed.blocks;
          return;
        }
        const resolvedLabel = `${block.prefix ?? ""}${formatImagePasteLabel(index, pastedImage.width, pastedImage.height)}`;
        const replaced = replacePastedBlock(this.buffer, this.cursorIndex, this.pastedBlocks, id, resolvedLabel);
        this.buffer = replaced.buffer;
        this.cursorIndex = replaced.cursorIndex;
        this.pastedBlocks = replaced.blocks;
        this.pastedImages = [
          ...this.pastedImages.filter((item) => item.id !== id),
          { id, index, width: pastedImage.width, height: pastedImage.height, image: pastedImage.image },
        ];
      })
      .catch(() => {
        const removed = replacePastedBlock(this.buffer, this.cursorIndex, this.pastedBlocks, id, "");
        this.buffer = removed.buffer;
        this.cursorIndex = removed.cursorIndex;
        this.pastedBlocks = removed.blocks;
      })
      .finally(() => {
        this.imagePastePromises.delete(pastePromise);
        this.clearSuggestionCache();
        this.invalidateInput();
      });
    this.imagePastePromises.add(pastePromise);
  }

  rememberInputHistory(text) {
    const value = String(text ?? "").trim();
    if (!value) return;
    this.inputHistory = this.inputHistory.filter((item) => item !== value);
    this.inputHistory.push(value);
    if (this.inputHistory.length > 100) this.inputHistory = this.inputHistory.slice(-100);
  }

  recallInputHistory(direction) {
    if (this.pastedBlocks.length > 0 || this.pastedImages.length > 0 || this.imagePastePromises.size > 0 || this.inputHistory.length === 0) return false;
    if (this.inputHistoryIndex === null) {
      if (direction > 0 || this.buffer.trim()) return false;
      this.inputHistoryDraft = this.buffer;
      this.inputHistoryIndex = this.inputHistory.length - 1;
    } else {
      this.inputHistoryIndex += direction;
    }
    if (this.inputHistoryIndex < 0) this.inputHistoryIndex = 0;
    if (this.inputHistoryIndex >= this.inputHistory.length) {
      this.inputHistoryIndex = null;
      this.buffer = this.inputHistoryDraft;
      this.inputHistoryDraft = "";
    } else {
      this.buffer = this.inputHistory[this.inputHistoryIndex];
    }
    this.cursorIndex = this.buffer.length;
    this.preferredCursorColumn = undefined;
    this.insertedStarterPrompt = "";
    this.completedText = "";
    this.suppressSuggestionsFor = "";
    this.clearSuggestionCache();
    this.selectedIndex = 0;
    this.selectionDirty = false;
    return true;
  }

  invalidateInput(options = {}) {
    this.cursor = null;
    this.host?.invalidate({ fixedOnly: true, ...options });
  }

  clearSuggestionCache() {
    this.cachedSuggestionText = undefined;
    this.cachedSuggestions = [];
  }

  alignSelectedSuggestion(suggestions = []) {
    if (this.selectionDirty || suggestions.length === 0) return;
    const preferredIndex = suggestions.findIndex((item) => item?.selected);
    if (preferredIndex >= 0) this.selectedIndex = preferredIndex;
  }

  notifySelectedSuggestion(item) {
    const key = item ? `${item.kind ?? ""}:${item.value ?? item.label ?? ""}` : "";
    if (key === this.lastSelectedSuggestionKey) return;
    this.lastSelectedSuggestionKey = key;
    queueMicrotask(() => this.options.onSuggestionSelect?.(item));
  }

  dispose() {
    if (this.pendingInsertTimer) clearTimeout(this.pendingInsertTimer);
  }
}

function shouldShowWaitingFor(text) {
  const value = String(text ?? "").trim().toLowerCase();
  return Boolean(value && !value.startsWith("/") && value !== "exit" && value !== "quit");
}

function isLikelyPaste(value) {
  return value.length >= pastedTextThreshold || /\r|\n/.test(value);
}

function shouldDeferTextInput(value) {
  return String(value ?? "").length > 1 || isLikelyPaste(String(value ?? ""));
}

function displayTextFor(text, blocks = []) {
  const validBlocks = validPastedBlocks(text, blocks);
  if (validBlocks.length === 0) return text;
  let cursor = 0;
  let rendered = "";
  for (const block of validBlocks) {
    if (block.start < cursor) continue;
    rendered += text.slice(cursor, block.start);
    rendered += block.label;
    cursor = block.end;
  }
  rendered += text.slice(cursor);
  return rendered;
}

function submissionTextFor(text, blocks = []) {
  const imageBlocks = validPastedBlocks(text, blocks).filter((block) => block.type === "image");
  if (imageBlocks.length === 0) return text;
  let cursor = 0;
  let submitted = "";
  for (const block of imageBlocks) {
    submitted += text.slice(cursor, block.start);
    submitted += " ";
    cursor = block.end;
  }
  return submitted + text.slice(cursor);
}

function displayCursorIndexFor(text, blocks = [], cursorIndex = 0) {
  const index = Math.max(0, Math.min(String(text ?? "").length, Number(cursorIndex) || 0));
  const validBlocks = validPastedBlocks(text, blocks);
  let rawCursor = 0;
  let displayCursor = 0;
  for (const block of validBlocks) {
    if (block.start < rawCursor) continue;
    if (index <= block.start) return displayCursor + (index - rawCursor);
    displayCursor += block.start - rawCursor;
    if (index < block.end) return displayCursor + String(block.label ?? "").length;
    displayCursor += String(block.label ?? "").length;
    rawCursor = block.end;
  }
  return displayCursor + (index - rawCursor);
}

function rawCursorIndexForDisplay(text, blocks = [], displayCursorIndex = 0) {
  const value = String(text ?? "");
  const validBlocks = validPastedBlocks(value, blocks);
  const displayLength = String(displayTextFor(value, validBlocks)).length;
  const index = Math.max(0, Math.min(displayLength, Number(displayCursorIndex) || 0));
  let rawCursor = 0;
  let displayCursor = 0;

  for (const block of validBlocks) {
    if (block.start < rawCursor) continue;
    const plainLength = block.start - rawCursor;
    if (index <= displayCursor + plainLength) return rawCursor + (index - displayCursor);
    displayCursor += plainLength;
    const labelLength = String(block.label ?? "").length;
    if (index < displayCursor + labelLength) {
      return index - displayCursor < labelLength / 2 ? block.start : block.end;
    }
    displayCursor += labelLength;
    rawCursor = block.end;
  }

  return Math.max(0, Math.min(value.length, rawCursor + (index - displayCursor)));
}

function validPastedBlocks(text, blocks = []) {
  const length = String(text ?? "").length;
  return blocks
    .filter((block) => Number.isInteger(block.start) && Number.isInteger(block.end) && block.start >= 0 && block.end <= length && block.start <= block.end)
    .sort((a, b) => a.start - b.start);
}

function shiftBlocksForInsert(blocks = [], insertIndex = 0, insertLength = 0) {
  if (!insertLength) return blocks;
  return blocks.map((block) => {
    if (block.start >= insertIndex) return { ...block, start: block.start + insertLength, end: block.end + insertLength };
    return block;
  });
}

function replacePastedBlock(buffer, cursorIndex, blocks = [], id, replacement) {
  const target = blocks.find((block) => block.id === id);
  if (!target) return { buffer, cursorIndex, blocks };
  const next = String(replacement ?? "");
  const removedLength = target.end - target.start;
  const delta = next.length - removedLength;
  const nextBuffer = buffer.slice(0, target.start) + next + buffer.slice(target.end);
  const nextBlocks = blocks
    .filter((block) => block.id !== id || next.length > 0)
    .map((block) => {
      if (block.id === id) return { ...block, end: block.start + next.length, label: next };
      if (block.start >= target.end) return { ...block, start: block.start + delta, end: block.end + delta };
      return block;
    });
  const nextCursorIndex = cursorIndex >= target.end
    ? cursorIndex + delta
    : cursorIndex > target.start
      ? target.start + next.length
      : cursorIndex;
  return { buffer: nextBuffer, cursorIndex: nextCursorIndex, blocks: nextBlocks };
}

function formatImagePasteLabel(index, width, height, options = {}) {
  if (options.pending) return `[Image ${index} · loading]`;
  const dimensions = width && height ? ` · ${width}×${height}` : "";
  return `[Image ${index}${dimensions}]`;
}

function removeInputRange(buffer, start, end, blocks = [], images = []) {
  const value = String(buffer ?? "");
  let deleteStart = Math.max(0, Math.min(value.length, Number(start) || 0));
  let deleteEnd = Math.max(deleteStart, Math.min(value.length, Number(end) || 0));
  if (deleteStart === deleteEnd) return { buffer: value, cursorIndex: deleteStart, blocks, images };

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const block of blocks) {
      if (block.end <= deleteStart || block.start >= deleteEnd) continue;
      const nextStart = Math.min(deleteStart, block.start);
      const nextEnd = Math.max(deleteEnd, block.end);
      if (nextStart !== deleteStart || nextEnd !== deleteEnd) expanded = true;
      deleteStart = nextStart;
      deleteEnd = nextEnd;
    }
  }

  const removedBlockIds = new Set(blocks
    .filter((block) => block.start >= deleteStart && block.end <= deleteEnd)
    .map((block) => block.id));
  const deleteLength = deleteEnd - deleteStart;
  return {
    buffer: value.slice(0, deleteStart) + value.slice(deleteEnd),
    cursorIndex: deleteStart,
    blocks: blocks
      .filter((block) => !removedBlockIds.has(block.id))
      .map((block) => block.start >= deleteEnd ? { ...block, start: block.start - deleteLength, end: block.end - deleteLength } : block),
    images: images.filter((image) => !removedBlockIds.has(image.id)),
  };
}

function removeInputUnitBeforeCursor(buffer, cursorIndex, blocks = [], images = []) {
  const cursor = Math.max(0, Math.min(String(buffer ?? "").length, Number(cursorIndex) || 0));
  if (!buffer || cursor <= 0) return { buffer, cursorIndex: cursor, blocks, images };
  const blockBeforeCursor = [...blocks]
    .filter((block) => block.end === cursor || (cursor > block.start && cursor < block.end))
    .sort((a, b) => b.start - a.start)[0];
  if (blockBeforeCursor) {
    const deleteStart = blockBeforeCursor.start;
    const deleteEnd = blockBeforeCursor.end;
    const deleteLength = deleteEnd - deleteStart;
    return {
      buffer: buffer.slice(0, deleteStart) + buffer.slice(deleteEnd),
      cursorIndex: deleteStart,
      blocks: blocks
        .filter((block) => block.id !== blockBeforeCursor.id)
        .map((block) => block.start >= deleteEnd ? { ...block, start: block.start - deleteLength, end: block.end - deleteLength } : block),
      images: blockBeforeCursor.type === "image" ? images.filter((item) => item.id !== blockBeforeCursor.id) : images,
    };
  }

  const deleteStart = previousGraphemeBoundary(buffer, cursor);
  const deleteLength = cursor - deleteStart;
  return {
    buffer: buffer.slice(0, deleteStart) + buffer.slice(cursor),
    cursorIndex: deleteStart,
    blocks: blocks.map((block) => block.start >= cursor ? { ...block, start: block.start - deleteLength, end: block.end - deleteLength } : block),
    images,
  };
}

function removeInputUnitAfterCursor(buffer, cursorIndex, blocks = [], images = []) {
  const cursor = Math.max(0, Math.min(String(buffer ?? "").length, Number(cursorIndex) || 0));
  if (!buffer || cursor >= buffer.length) return { buffer, cursorIndex: cursor, blocks, images };
  const blockAfterCursor = [...blocks]
    .filter((block) => block.start === cursor || (cursor > block.start && cursor < block.end))
    .sort((a, b) => a.start - b.start)[0];
  if (blockAfterCursor) {
    const deleteStart = blockAfterCursor.start;
    const deleteEnd = blockAfterCursor.end;
    const deleteLength = deleteEnd - deleteStart;
    return {
      buffer: buffer.slice(0, deleteStart) + buffer.slice(deleteEnd),
      cursorIndex: deleteStart,
      blocks: blocks
        .filter((block) => block.id !== blockAfterCursor.id)
        .map((block) => block.start >= deleteEnd ? { ...block, start: block.start - deleteLength, end: block.end - deleteLength } : block),
      images: blockAfterCursor.type === "image" ? images.filter((item) => item.id !== blockAfterCursor.id) : images,
    };
  }

  const deleteEnd = nextGraphemeBoundary(buffer, cursor);
  const deleteLength = deleteEnd - cursor;
  return {
    buffer: buffer.slice(0, cursor) + buffer.slice(deleteEnd),
    cursorIndex: cursor,
    blocks: blocks.map((block) => block.start >= deleteEnd ? { ...block, start: block.start - deleteLength, end: block.end - deleteLength } : block),
    images,
  };
}

function normalizeQueuedMessages(value = {}) {
  return {
    steering: Array.isArray(value.steering) ? value.steering.filter(Boolean).map(String) : [],
    followUp: Array.isArray(value.followUp) ? value.followUp.filter(Boolean).map(String) : [],
  };
}

function renderQueuedMessages(queued, width = 80, theme = fallbackTheme) {
  const lines = [];
  const maxWidth = Math.max(20, Number(width) || 80);
  const pushMessage = (label, text) => {
    const prefix = `  ${label}: `;
    const wrapped = wrapPlain(String(text ?? "").replace(/\s+/g, " ").trim(), Math.max(12, maxWidth - visibleWidth(prefix) - 2));
    const [first = "", ...rest] = wrapped.length ? wrapped : [""];
    lines.push(`${theme.muted}${prefix}${theme.quoteFg ?? theme.muted}${first}${reset}`);
    for (const line of rest.slice(0, 2)) {
      lines.push(`${theme.muted}    ↳ ${theme.quoteFg ?? theme.muted}${line}${reset}`);
    }
    if (rest.length > 2) lines.push(`${theme.muted}    …${reset}`);
  };

  for (const message of queued.steering) pushMessage("Steer waiting", message);
  for (const message of queued.followUp) pushMessage("Turn queue", message);
  lines.push(`${theme.muted}  Steer sends after next tool result · Queue sends after turn · Alt+Up restores${reset}`);
  return lines;
}

function renderInputActivityLine(frame = 0, theme = fallbackTheme, label = "working") {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinner = frames[frame % frames.length];
  return `  ${theme.accent}${spinner}${reset} ${theme.muted}${String(label ?? "working").replace(/\s+/g, " ").trim() || "working"}${reset}`;
}

function alignMenuPreview(left, preview, width, theme = fallbackTheme) {
  if (!preview) return left;
  const hint = `${theme.muted}${preview}${reset}`;
  const gap = Math.max(2, width - visibleWidth(left) - visibleWidth(hint));
  return `${left}${" ".repeat(gap)}${hint}`;
}

function renderStarterRecommendationLine(item, width, theme = fallbackTheme) {
  const prompt = String(item?.prompt ?? "").trim();
  if (!prompt) return "";
  const prefixText = width >= 42 ? "maybe start with " : "try ";
  const hintText = width >= 52 ? " - up uses it, down clears it" : width >= 34 ? " - up use, down clear" : "";
  const prefix = `${theme.muted}${prefixText}${reset}`;
  const hint = hintText ? `${theme.muted}${hintText}${reset}` : "";
  const available = Math.max(4, width - visibleWidth(prefix) - visibleWidth(hint));
  return `${prefix}${theme.primary}${truncatePlain(prompt, available)}${reset}${hint}`;
}

function renderEditorLines({ prompt, text = "", cursorIndex = undefined, placeholder = "message..." }, width, theme = fallbackTheme) {
  const promptWidth = visibleWidth(prompt);
  const rowWidth = Math.max(1, width - promptWidth);
  if (!text) {
    return {
      lines: [`${prompt}${theme.muted}${placeholder}${reset}`],
      cursor: { row: 0, col: promptWidth },
    };
  }
  const value = String(text ?? "");
  const layout = buildEditorInputLayout(value, rowWidth);
  const index = Math.max(0, Math.min(value.length, Number(cursorIndex ?? value.length) || 0));
  const position = layout.positions[index] ?? { row: 0, col: 0 };
  return {
    lines: layout.rows.map((row, rowIndex) => `${rowIndex === 0 ? prompt : " ".repeat(promptWidth)}${row}`),
    cursor: { row: position.row, col: promptWidth + position.col },
  };
}

function renderInputRail(width, theme = fallbackTheme) {
  return `${theme.editorBorder}${"─".repeat(Math.max(1, width))}${reset}`;
}

function styleAttachmentLabels(text, theme = fallbackTheme, restore = fgReset) {
  return String(text).replace(/\[(Image \d+[^\]]*|Pasted Content[^\]]*)\]/g, (_match, inner) => {
    return `${theme.muted}[${theme.accent}${bold}${inner}${normalIntensity}${theme.muted}]${restore}`;
  });
}

function pickPlaceholder(previous = "", options = {}) {
  let values = inputPlaceholders.filter((value) => typeof value === "string" && value.trim());
  if (shouldUseFirstInstallPlaceholder(options)) return firstInstallPlaceholder;
  values = values.filter((value) => value !== firstInstallPlaceholder);
  if (values.length === 0) return firstInstallPlaceholder;
  if (values.length === 1) return values[0];
  let next = values[Math.floor(Math.random() * values.length)];
  if (next === previous) next = values[(values.indexOf(next) + 1) % values.length];
  return next;
}

function shouldUseFirstInstallPlaceholder(options = {}) {
  const project = String(options.project ?? "").trim();
  if (!project) return false;
  const now = Number(options.now ?? Date.now());
  const preferences = readPlaceholderPreferences(project);
  let firstSeen = Date.parse(String(preferences[placeholderFirstSeenKey] ?? ""));
  if (!Number.isFinite(firstSeen)) {
    firstSeen = now;
    writePlaceholderPreferences(project, {
      ...preferences,
      [placeholderFirstSeenKey]: new Date(now).toISOString(),
    });
  }
  return now - firstSeen < placeholderDiversityDelayMs;
}

function readPlaceholderPreferences(project) {
  const file = path.join(project, placeholderPreferenceFile);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePlaceholderPreferences(project, preferences) {
  const file = path.join(project, placeholderPreferenceFile);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  } catch {
    // Placeholder selection should never stop the editor from opening.
  }
}

function normalizeStarterRecommendations(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => typeof item === "string"
      ? { prompt: item.trim(), description: "" }
      : { prompt: String(item?.prompt ?? item?.value ?? "").trim(), description: String(item?.description ?? item?.why ?? "").trim() })
    .filter((item) => item.prompt)
    .slice(0, 1);
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  } catch {
    return fallback;
  }
}
