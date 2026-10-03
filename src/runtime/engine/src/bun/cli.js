// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { registerBunOAuthFlows } from "../../../providers/src/bun-oauth.js";
import { APP_NAME } from "../config.js";
process.title = APP_NAME;
process.emitWarning = () => {
};
registerBunOAuthFlows();
import { restoreSandboxEnv } from "./restore-sandbox-env.js";
restoreSandboxEnv();
await import("./register-bedrock.js");
await import("../cli.js");
