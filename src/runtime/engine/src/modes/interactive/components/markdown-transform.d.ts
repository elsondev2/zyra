import type { MarkdownTransformContext, MarkdownTransformer } from "../../../core/extensions/types.js";
export declare function createMarkdownTransform(messageType: MarkdownTransformContext["messageType"], isStreaming: boolean, transformers: readonly MarkdownTransformer[]): (markdown: string, availableWidth: number) => string;
