import type { ProviderHeaders } from "../types.js";
export declare function headersToRecord(headers: Headers): Record<string, string>;
export declare function providerHeadersToRecord(headers: ProviderHeaders | undefined): Record<string, string> | undefined;
