import { type CborOptions } from "./options.js";
/** Encodes the protocol's strict, definite-length RFC 8949 subset. */
export declare function encodeCbor(value: unknown, options?: CborOptions): Uint8Array;
