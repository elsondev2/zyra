import { type Static, Type } from "typebox";
import type { AgentHarnessTool } from "../types.js";
import type { ExecutionToolContext } from "./tool-context.js";
declare const editSchema: Type.TObject<{
    path: Type.TString;
    edits: Type.TArray<Type.TObject<{
        oldText: Type.TString;
        newText: Type.TString;
    }>>;
}>;
export type EditToolInput = Static<typeof editSchema>;
export interface EditToolDetails {
    diff: string;
    patch: string;
    firstChangedLine?: number;
}
export declare function createEditTool<TContext extends ExecutionToolContext = ExecutionToolContext>(): AgentHarnessTool<TContext, typeof editSchema, EditToolDetails | undefined>;
export {};
