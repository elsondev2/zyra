// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { clientCommand } from "./commands/client.js";
import { zyraCommand } from "./commands/zyra.js";
import { serverCommand } from "./commands/server.js";
const experimentalCli = zyraCommand.command(serverCommand).command(clientCommand);
export {
  experimentalCli
};
