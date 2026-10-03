import { type Result } from "../../types.js";
import type { SessionMutation } from "../state.js";
import { JsonlDecodeError } from "./errors.js";
import type { JsonlSessionMetadata, JsonlV4Header } from "./types.js";
export declare function parseHeader(line: string): Result<JsonlV4Header, JsonlDecodeError>;
export declare function encodeHeader(header: JsonlV4Header): string;
export declare function metadataFromHeader(header: JsonlV4Header, path: string, modifiedAt: number): JsonlSessionMetadata;
export declare function parseMutation(line: string): Result<SessionMutation, JsonlDecodeError>;
export declare function encodeMutation(mutation: SessionMutation): string;
