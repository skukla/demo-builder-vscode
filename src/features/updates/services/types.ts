/**
 * Shared types for updates module
 */

/**
 * GitHub Release information
 */
export interface ReleaseInfo {
    version: string;
    /** The release's tag, as GitHub holds it: what a component's clone moves to. */
    tag: string;
    downloadUrl: string;
    releaseNotes: string;
    publishedAt: string;
    isPrerelease: boolean;
}

/**
 * Result of update availability check
 */
export interface UpdateCheckResult {
    hasUpdate: boolean;
    current: string;
    latest: string;
    releaseInfo?: ReleaseInfo;
}
