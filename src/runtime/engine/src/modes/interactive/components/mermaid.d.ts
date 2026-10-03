import type { MarkdownTransformer } from "../../../core/extensions/types.js";
import type { MermaidRenderingMode } from "../../../core/settings-manager.js";
import type { Theme } from "../theme/theme.js";
interface MermaidTransformerOptions {
    getMode: () => MermaidRenderingMode;
    theme?: Theme;
}
/** Create a transformer that replaces top-level Mermaid code blocks with Unicode terminal diagrams. */
export declare function createMermaidMarkdownTransformer(options: MermaidTransformerOptions): MarkdownTransformer;
export {};
