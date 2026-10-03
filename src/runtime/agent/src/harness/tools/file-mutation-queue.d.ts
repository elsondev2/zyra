import type { ExecutionEnv } from "../types.js";
/** Serialize file mutations targeting the same environment and canonical path. */
export declare function withFileMutationQueue<T>(env: ExecutionEnv, path: string, fn: () => Promise<T>): Promise<T>;
