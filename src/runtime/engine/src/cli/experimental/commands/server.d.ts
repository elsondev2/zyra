import type { AuthInput } from "../auth.js";
import { Command } from "../command.js";
import type { TransportAddress } from "../transport-address.js";
export interface ServerCommand {
    readonly command: "server";
    readonly auth?: AuthInput;
    readonly listen?: readonly TransportAddress[];
}
export interface ServerCommandContext {
    runServer(command: ServerCommand): void | Promise<void>;
}
export declare const serverCommand: Command<ServerCommand, ServerCommandContext, ServerCommand>;
