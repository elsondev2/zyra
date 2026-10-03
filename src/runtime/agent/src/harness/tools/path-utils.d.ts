import type { ExecutionEnv } from "../types.js";
export declare function resolveToolPath(env: ExecutionEnv, path: string, signal?: AbortSignal): Promise<string>;
export declare function resolveReadToolPath(env: ExecutionEnv, path: string, signal?: AbortSignal): Promise<string>;
