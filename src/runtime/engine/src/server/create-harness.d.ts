import { AgentHarness, type AgentHarnessOptions, type ExecutionEnv, type HarnessTool } from "../../../agent/src/index.js";
import { type BuildSystemPromptOptions } from "../core/system-prompt.js";
export interface CodingAgentHarnessTool extends HarnessTool {
    promptSnippet?: string;
    promptGuidelines?: readonly string[];
}
export interface CreateCodingAgentHarnessOptions extends Omit<AgentHarnessOptions, "toolContext" | "tools"> {
    env: ExecutionEnv;
    bashCommandPrefix?: string;
    /** Path to the JSONL session file exposed to default bash commands as ZYRA_SESSION_FILE. */
    sessionFile?: string;
    tools?: CodingAgentHarnessTool[];
    systemPromptOptions?: Omit<BuildSystemPromptOptions, "cwd" | "promptGuidelines" | "selectedTools" | "toolSnippets">;
}
export interface BuildCodingAgentHarnessSystemPromptOptions {
    cwd: string;
    tools: readonly CodingAgentHarnessTool[];
    activeToolNames: readonly string[];
    systemPromptOptions?: CreateCodingAgentHarnessOptions["systemPromptOptions"];
}
export declare function buildCodingAgentHarnessSystemPrompt(options: BuildCodingAgentHarnessSystemPromptOptions): string;
export declare function createCodingAgentHarness(options: CreateCodingAgentHarnessOptions): Promise<{
    harness: AgentHarness;
    suspended: import("../../../agent/src/index.js").SuspendedOperation[];
}>;
