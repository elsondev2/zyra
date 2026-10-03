import type { SessionBackendConformanceCase, SessionBackendFixtureFactory } from "./types.js";
/** Creates the session backend conformance cases. Each case creates and disposes its own fixture. */
export declare function createSessionBackendConformance(factory: SessionBackendFixtureFactory): readonly SessionBackendConformanceCase[];
