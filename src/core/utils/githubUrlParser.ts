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
 * GitHub owner/repo charset. owner/repo are interpolated into a shell-executed
 * `git clone` and into path segments, so shell metacharacters and dot-only
 * names are rejected fail-fast. Sources can arrive from imported settings
 * files and pasted links, not just the UI, so the gate lives here, shared by
 * the App Builder catalog loader and the shared-demo probe.
 */
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;
/** Safe git ref charset (branch names may contain slashes; `..` is rejected separately). */
const GIT_REF = /^[A-Za-z0-9._/-]+$/;

/** Refuse an owner or repo name outside the safe charset. */
export function assertGitHubName(value: string, label: string): void {
    if (!GITHUB_NAME.test(value) || value === '.' || value === '..') {
        throw new Error(`Invalid GitHub ${label}: "${value}"`);
    }
}

/** Refuse a git ref outside the safe charset. */
export function assertGitRef(value: string): void {
    if (!GIT_REF.test(value) || value.includes('..')) {
        throw new Error(`Invalid git branch: "${value}"`);
    }
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
