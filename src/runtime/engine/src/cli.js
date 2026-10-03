// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { APP_NAME } from "./config.js";
import { configureHttpDispatcher } from "./core/http-dispatcher.js";
import { main } from "./main.js";
process.title = APP_NAME;
process.env.ZYRA_CODING_AGENT = "true";
process.env.AI_AGENT = "zyra";
process.emitWarning = () => {
};
configureHttpDispatcher();
main(process.argv.slice(2));
