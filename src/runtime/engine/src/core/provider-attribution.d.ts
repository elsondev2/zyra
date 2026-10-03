import type { Api, Model, ProviderHeaders } from "../../../providers/src/index.js";
import type { SettingsManager } from "./settings-manager.js";
export declare function mergeProviderAttributionHeaders(model: Model<Api>, settingsManager: SettingsManager, sessionId: string | undefined, ...headerSources: Array<ProviderHeaders | undefined>): ProviderHeaders | undefined;
