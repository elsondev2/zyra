import type { Provider } from "../models.js";
export interface RadiusProviderOptions {
    id?: string;
    name?: string;
    gateway?: string;
}
/** Radius gateway provider with a persisted, dynamically refreshed catalog. */
export declare function radiusProvider(options?: RadiusProviderOptions): Provider<"pi-messages">;
