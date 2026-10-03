import type { ByteTransportFactory } from "./transport.js";
export interface UnixTransportOptions {
    path: string;
    maxPendingBytes?: number;
}
/** Creates fresh Unix-domain socket transports for PiClient connection attempts in Node-compatible runtimes. */
export declare function createUnixTransportFactory(options: UnixTransportOptions): ByteTransportFactory;
