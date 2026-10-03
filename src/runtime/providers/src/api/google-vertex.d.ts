import type { SimpleStreamOptions, StreamFunction, StreamOptions } from "../types.js";
import type { GoogleApiThinkingLevel } from "./google-shared.js";
export interface GoogleVertexOptions extends StreamOptions {
    toolChoice?: "auto" | "none" | "any";
    thinking?: {
        enabled: boolean;
        budgetTokens?: number;
        level?: GoogleApiThinkingLevel;
    };
    project?: string;
    location?: string;
}
export declare const stream: StreamFunction<"google-vertex", GoogleVertexOptions>;
export declare const streamSimple: StreamFunction<"google-vertex", SimpleStreamOptions>;
