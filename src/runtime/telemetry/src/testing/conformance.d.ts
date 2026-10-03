import type { TelemetryAdapterConformanceCase, TelemetryAdapterFixtureFactory } from "./types.js";
/** Creates runner-independent cases for the callback telemetry adapter contract. */
export declare function createTelemetryAdapterConformance(factory: TelemetryAdapterFixtureFactory): readonly TelemetryAdapterConformanceCase[];
