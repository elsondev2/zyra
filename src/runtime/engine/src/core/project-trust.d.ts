import type { LoadExtensionsResult, ProjectTrustContext } from "./extensions/types.js";
import type { DefaultProjectTrust } from "./settings-manager.js";
import { type ProjectTrustStore } from "./trust-manager.js";
export type AppMode = "interactive" | "print" | "json" | "rpc";
export interface ResolveProjectTrustedOptions {
    cwd: string;
    trustStore: ProjectTrustStore;
    trustOverride?: boolean;
    defaultProjectTrust?: DefaultProjectTrust;
    extensionsResult?: LoadExtensionsResult;
    projectTrustContext: ProjectTrustContext;
    onExtensionError?: (message: string) => void;
}
export declare function resolveProjectTrusted(options: ResolveProjectTrustedOptions): Promise<boolean>;
