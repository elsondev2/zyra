// Zyra-maintained runtime. Derived from MIT-licensed Pi; see ../LICENSE and provenance.json.
import { type ClientCommandContext, clientCommand } from "./commands/client.ts";
import { type ZyraCommandContext, zyraCommand } from "./commands/zyra.ts";
import { type ServerCommandContext, serverCommand } from "./commands/server.ts";

export type ExperimentalCliContext = ZyraCommandContext & ServerCommandContext & ClientCommandContext;

export const experimentalCli = zyraCommand.command(serverCommand).command(clientCommand);
