/**
 * Shared GitHub API utilities for update-checking services.
 *
 * Centralises header construction, fetch-with-timeout boilerplate,
 * common response types, and reusable query helpers so that
 * ForkSyncService, AddonUpdateChecker, and TemplateUpdateChecker
 * don't each reimplement them.
 *
 * Each consumer still handles response status codes its own way —
 * this module only removes the mechanical duplication.
 */

import semver from 'semver';
import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GITHUB_API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Shared response types
// ---------------------------------------------------------------------------

export interface GitHubCompareResponse {
    ahead_by: number;
}

export interface GitHubReleaseInfo {
    /** Raw tag name as returned by GitHub (may include a `v` prefix). */
    tag: string;
    /** Clean semver version stripped of any leading `v`. */
    version: string;
}

// ---------------------------------------------------------------------------
// Token + header construction
// ---------------------------------------------------------------------------

/**
 * EDS stores the GitHub OAuth token under this key as JSON
 * `{ token, tokenType, scopes }` — see `TOKEN_STORAGE_KEY` and `storeToken` in
 * src/features/eds/services/github/githubTokenService.ts (type `GitHubToken` in
 * src/features/eds/services/types.ts). Read directly, not via the EDS service,
 * because updates must not import from features/eds.
 */
const EDS_TOKEN_KEY = 'github-token';

/**
 * Read the GitHub access token EDS stored. Returns null when none is stored
 * or the stored value is not the expected JSON.
 */
export async function readGitHubToken(secrets: vscode.SecretStorage): Promise<string | null> {
    const stored = await secrets.get(EDS_TOKEN_KEY);
    if (!stored) return null;
    try {
        const parsed = JSON.parse(stored) as { token?: unknown };
        // An empty string is returned as-is: callers' `!token` checks reject it.
        return typeof parsed.token === 'string' ? parsed.token : null;
    } catch {
        return null;
    }
}

/**
 * Build standard GitHub API headers, optionally including the auth token
 * EDS stored in VS Code's SecretStorage.
 */
export async function buildGitHubHeaders(
    secrets: vscode.SecretStorage,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Demo-Builder-VSCode',
    };

    const token = await readGitHubToken(secrets);
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    return headers;
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with an AbortController timeout (`TIMEOUTS.QUICK`).
 *
 * Returns the raw `Response` — callers decide how to interpret
 * status codes and parse the body.
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.QUICK);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

// ---------------------------------------------------------------------------
// Reusable query helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the latest commit SHA for a branch.
 * Returns null on any error (graceful degradation).
 */
export async function getLatestBranchCommit(
    secrets: vscode.SecretStorage,
    owner: string,
    repo: string,
    branch: string,
): Promise<string | null> {
    try {
        const headers = await buildGitHubHeaders(secrets);
        const response = await fetchWithTimeout(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}`,
            { headers },
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.commit?.sha ?? null;
    } catch {
        return null;
    }
}

/**
 * Fetch the latest release for a repo and return its tag + cleaned semver version.
 * Returns null on any error (graceful degradation): network failure, non-OK
 * response (e.g., 404 for repos with no releases, 403 rate-limit), missing
 * `tag_name`, or a tag that does not parse as semver.
 */
export async function getLatestRelease(
    secrets: vscode.SecretStorage,
    owner: string,
    repo: string,
): Promise<GitHubReleaseInfo | null> {
    try {
        const headers = await buildGitHubHeaders(secrets);
        const response = await fetchWithTimeout(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/latest`,
            { headers },
        );

        if (!response.ok) return null;

        const data = (await response.json()) as { tag_name?: string };
        const tag = data.tag_name;
        if (typeof tag !== 'string') return null;

        // An empty tag coerces to null here, so it needs no check of its own.
        const version = semver.valid(semver.coerce(tag));
        if (!version) return null;

        return { tag, version };
    } catch {
        return null;
    }
}

/**
 * Compare two commits and return the comparison response.
 * Returns null on any error (graceful degradation).
 *
 * `base` and `head` can be commit SHAs, branch names, or cross-repo
 * refs like `"otherOwner/otherRepo:main"`.
 */
export async function compareCommits(
    secrets: vscode.SecretStorage,
    owner: string,
    repo: string,
    base: string,
    head: string,
): Promise<GitHubCompareResponse | null> {
    try {
        const headers = await buildGitHubHeaders(secrets);
        const response = await fetchWithTimeout(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${base}...${head}`,
            { headers },
        );

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as GitHubCompareResponse;
    } catch {
        return null;
    }
}
