import type { Provider } from "../../../providers/src/index.js";
export declare const REMOTE_CATALOG_REFRESH_INTERVAL_MS: number;
/** Add a persisted explicitly configured catalog overlay to a static built-in provider. */
export declare function withRemoteCatalog(provider: Provider, catalogBaseUrl?: string | undefined, localGeneratedAt?: number): Provider;
