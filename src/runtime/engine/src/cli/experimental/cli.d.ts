import { type ClientCommandContext } from "./commands/client.js";
import { type ZyraCommandContext } from "./commands/zyra.js";
import { type ServerCommandContext } from "./commands/server.js";
export type ExperimentalCliContext = ZyraCommandContext & ServerCommandContext & ClientCommandContext;
export declare const experimentalCli: import("./command.js").Command<import("./commands/zyra.js").ZyraCommand, ZyraCommandContext & ServerCommandContext & ClientCommandContext, import("./commands/client.js").ClientCommand | import("./commands/zyra.js").ZyraCommand | import("./commands/server.js").ServerCommand>;
