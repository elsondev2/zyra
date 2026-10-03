import type { Args } from "../../args.js";
import type { AuthInput } from "../auth.js";
import { Command } from "../command.js";
import type { TransportAddress } from "../transport-address.js";
export interface ZyraCommand {
    readonly command: "zyra";
    readonly auth?: AuthInput;
    readonly options: Args;
    readonly listen?: readonly TransportAddress[];
}
export interface ZyraCommandContext {
    runPi(command: ZyraCommand): void | Promise<void>;
}
export declare const zyraCommand: Command<ZyraCommand, ZyraCommandContext, ZyraCommand>;
