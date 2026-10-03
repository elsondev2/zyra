import { type Static, Type } from "typebox";
import type { AgentHarnessTool } from "../types.js";
import type { ExecutionToolContext } from "./tool-context.js";
declare const writeSchema: Type.TObject<{
    path: Type.TString;
    content: Type.TString;
}>;
export type WriteToolInput = Static<typeof writeSchema>;
export declare function createWriteTool<TContext extends ExecutionToolContext = ExecutionToolContext>(): AgentHarnessTool<TContext, typeof writeSchema, undefined>;
export {};
