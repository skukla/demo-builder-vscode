/** The shapes of GitHub's release API, and the update channels that read it. */

/**
 * Extension/component update channel.
 * - stable: production final releases only
 * - beta: final + -beta.* prereleases
 * - early-access: -alpha.* prereleases (collaborator-gated)
 */
export type UpdateChannel = 'stable' | 'beta' | 'early-access';

/** GitHub API Release Asset */
export interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
    state: string;
}

/** GitHub API Release Response */
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
