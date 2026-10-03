export interface LatestZyraRelease {
    version: string;
    packageName?: string;
    note?: string;
}
/** Include useful errno details hidden behind Node's generic "fetch failed" error. */
export declare function formatVersionCheckError(error: unknown): string;
export declare function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined;
export declare function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean;
export declare function getLatestZyraRelease(currentVersion: string, options?: {
    timeoutMs?: number;
    retry?: boolean;
}): Promise<LatestZyraRelease | undefined>;
export declare function getLatestZyraVersion(currentVersion: string, options?: {
    timeoutMs?: number;
    retry?: boolean;
}): Promise<string | undefined>;
export declare function checkForNewZyraVersion(currentVersion: string): Promise<LatestZyraRelease | undefined>;
