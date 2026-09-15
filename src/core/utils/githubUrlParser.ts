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
 * An Edge Delivery site address carries its repository: the host is
 * `<ref>--<repo>--<owner>` under `aem.live` / `aem.page` (or the older
 * `hlx.live` / `hlx.page`), which is exactly how the extension builds every
 * storefront's own address. Reading one back is exact, not a guess.
 *
 * Long dashes are read as the two hyphens they were before a chat client
 * "corrected" them: a colleague pastes a site address from a message far
 * more often than from a browser bar.
 */
const SITE_HOST = /^([^.]+)\.(?:aem|hlx)\.(?:live|page)$/i;

/**
 * Parse a link to a demo's CODE: a GitHub link, or an Edge Delivery site
 * address. Used where a colleague's link is pasted; the GitHub-only parser
 * above stays for every path that must be a repository link.
 *
 * @param url - What was pasted
 * @returns The owner and repo, or null when the text names neither
 */
export function parseStorefrontLink(url: string | undefined): GitHubRepoInfo | null {
    const fromGitHub = parseGitHubUrl(url);
    if (fromGitHub) return fromGitHub;
    if (!url) return null;
    const normalised = url.trim().replace(/[\u2013\u2014]/g, '--');
    let host: string;
    try {
        host = new URL(normalised.includes('://') ? normalised : `https://${normalised}`).hostname;
    } catch {
        return null;
    }
    const match = SITE_HOST.exec(host);
    if (!match) return null;
    const parts = match[1].split('--');
    if (parts.length !== 3 || parts.some((part) => part === '')) return null;
    const [, repo, owner] = parts;
    return { owner, repo };
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

/**
 * Why an owner/repo pair is not a usable GitHub source, or undefined when it is.
 * The answer is this module's own sentence, so a handler can return it as is.
 */
export function gitHubSourceProblem(owner: string, repo: string): string | undefined {
    try {
        assertGitHubName(owner, 'owner');
        assertGitHubName(repo, 'repo');
        return undefined;
    } catch (error) {
        return (error as Error).message;
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
