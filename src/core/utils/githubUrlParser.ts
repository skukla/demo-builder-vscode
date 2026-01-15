/**
 * GitHub URL parsing utilities
 *
 * Shared utility for extracting owner/repo from GitHub URLs.
 * Used by project creation, wizard helpers, and component updates.
 */

export interface GitHubRepoInfo {
    owner: string;
    repo: string;
}

/**
 * Parse GitHub URL to extract owner and repo name
 *
 * Supports formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 *
 * @param url - GitHub repository URL
 * @returns Object with owner and repo, or null if parsing fails
 */
export function parseGitHubUrl(url: string | undefined): GitHubRepoInfo | null {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== 'github.com') {
            return null;
        }
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
            return {
                owner: parts[0],
                repo: parts[1].replace(/\.git$/, ''),
            };
        }
        return null;
    } catch {
        return null;
    }
}
