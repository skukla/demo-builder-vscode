/**
 * Shared types for updates module
 */

/**
 * GitHub Release information
 */
export interface ReleaseInfo {
    version: string;
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

/**
 * GitHub API Release Asset
 */
export interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
    state: string;
}

/**
 * GitHub API Release Response
 */
export interface GitHubRelease {
    tag_name: string;
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string;
    zipball_url: string;
    tarball_url: string;
    assets: GitHubReleaseAsset[];
    message?: string; // Error message when release not found
}
