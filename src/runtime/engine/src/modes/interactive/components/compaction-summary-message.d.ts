import { Box, type MarkdownTheme } from "../../../../../terminal/src/index.js";
import type { CompactionSummaryMessage } from "../../../core/messages.js";
/**
 * Component that renders a compaction message with collapsed/expanded state.
 * Uses same background color as custom messages for visual consistency.
 */
export declare class CompactionSummaryMessageComponent extends Box {
    private expanded;
    private message;
    private markdownTheme;
    constructor(message: CompactionSummaryMessage, markdownTheme?: MarkdownTheme);
    setExpanded(expanded: boolean): void;
    invalidate(): void;
    private updateDisplay;
}
