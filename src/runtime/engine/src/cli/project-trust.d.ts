import type { ProjectTrustContext } from "../core/extensions/types.js";
import type { AppMode } from "../core/project-trust.js";
import type { SettingsManager } from "../core/settings-manager.js";
export declare function createProjectTrustContext(options: {
    cwd: string;
    mode: AppMode;
    settingsManager: SettingsManager;
    hasUI: boolean;
}): ProjectTrustContext;
