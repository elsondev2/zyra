// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
import type { ExecutionEnv } from "../types.ts";

/** Filesystem and shell context required by the built-in execution tools. */
export interface ExecutionToolContext {
	env: ExecutionEnv;
}
