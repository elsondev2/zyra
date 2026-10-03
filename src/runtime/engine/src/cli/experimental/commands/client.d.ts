import type { AuthInput } from "../auth.js";
import { Command } from "../command.js";
import type { TransportAddress } from "../transport-address.js";
export interface ClientCommand {
    readonly command: "client";
    readonly auth?: AuthInput;
    readonly connect?: TransportAddress;
}
export interface ClientCommandContext {
    runClient(command: ClientCommand): void | Promise<void>;
}
export declare const clientCommand: Command<ClientCommand, ClientCommandContext, ClientCommand>;
