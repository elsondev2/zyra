import { type ExecutionEnv, ExecutionError, type Result, type ShellExecOptions } from "../types.js";
import { type TruncationResult } from "./truncate.js";
export interface ShellCaptureProgress {
    output: string;
    truncation: TruncationResult;
    fullOutputPath?: string;
    lastLineBytes: number;
}
export interface ShellCaptureOptions extends Omit<ShellExecOptions, "onStdout" | "onStderr"> {
    onChunk?: (chunk: string, getProgress: () => ShellCaptureProgress) => void;
    /** Return shell execution failures with captured output instead of as a failed Result. */
    returnExecutionErrors?: boolean;
}
export interface ShellCaptureResult extends ShellCaptureProgress {
    exitCode: number | undefined;
    cancelled: boolean;
    truncated: boolean;
    executionError?: ExecutionError;
}
export declare function sanitizeBinaryOutput(str: string): string;
export declare function executeShellWithCapture(env: ExecutionEnv, command: string, options?: ShellCaptureOptions): Promise<Result<ShellCaptureResult, ExecutionError>>;
