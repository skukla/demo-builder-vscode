/**
 * Reading a PUBLIC repository with no credential at all.
 *
 * The shared-demo probe only reads, and a public repository needs no token to
 * read. It went through the authenticated client anyway, so two unrelated
 * things could stop an SC importing a colleague's public storefront: not being
 * signed in to GitHub, and being signed in with a token GitHub no longer
 * accepts. Both were reported as "its repository couldn't be found, or you
 * don't have access to it" (found live 2026-09-17: the token behind the window
 * had expired; `sayurihanki/aistore` is public and answers 200 unauthenticated).
 *
 * These readers satisfy the two interfaces the probe asks for, so it cannot
 * tell which one it was handed. They are deliberately read-only: there is no
 * write here to reach for, and a public read can do nothing else.
 *
 * Unauthenticated GitHub allows 60 requests an hour per address. A probe spends
 * five, so an SC can import a handful of demos between sign-ins; beyond that
 * GitHub answers 403 and the probe says so.
 *
 * @module features/eds/services/github/publicGitHubReads
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubFileContent, GitHubRepo } from '@/features/eds/services/types';

const API = 'https://api.github.com';

/** The two reads the shared-demo probe makes. */
export interface PublicRepoReaders {
    repoOps: { getRepository(owner: string, repo: string): Promise<GitHubRepo> };
    fileOps: {
        getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFileContent | null>;
    };
}

/** GitHub's own status, kept on the error so the caller can word the refusal. */
export class PublicReadError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'PublicReadError';
    }
}

async function read(url: string, fetchImpl: typeof fetch): Promise<Response> {
    return fetchImpl(url, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(TIMEOUTS.QUICK),
    });
}

/**
 * Readers that go to GitHub's public API with no credential.
 *
 * @param fetchImpl - injected fetch; defaults to the global
 * @returns the repository and file readers the probe needs
 */
export function publicRepoReaders(fetchImpl: typeof fetch = fetch): PublicRepoReaders {
    return {
        repoOps: {
            async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
                const response = await read(`${API}/repos/${owner}/${repo}`, fetchImpl);
                if (!response.ok) {
                    throw new PublicReadError(response.status, `GitHub answered ${response.status} for ${owner}/${repo}`);
                }
                const data = (await response.json()) as {
                    id: number;
                    name: string;
                    full_name: string;
                    html_url: string;
                    clone_url: string;
                    default_branch: string;
                    is_template?: boolean;
                    private: boolean;
                };
                return {
                    id: data.id,
                    name: data.name,
                    fullName: data.full_name,
                    htmlUrl: data.html_url,
                    cloneUrl: data.clone_url,
                    defaultBranch: data.default_branch,
                    isTemplate: data.is_template ?? false,
                    isPrivate: data.private,
                };
            },
        },
        fileOps: {
            /** Null for a file that is not there, as the authenticated reader answers. */
            async getFileContent(
                owner: string,
                repo: string,
                path: string,
                ref?: string,
            ): Promise<GitHubFileContent | null> {
                const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
                const response = await read(`${API}/repos/${owner}/${repo}/contents/${path}${query}`, fetchImpl);
                if (response.status === 404) return null;
                if (!response.ok) {
                    throw new PublicReadError(response.status, `GitHub answered ${response.status} for ${path}`);
                }
                const data = (await response.json()) as {
                    content?: string;
                    encoding?: string;
                    sha?: string;
                    type?: string;
                };
                // A directory answers an ARRAY, and a file over 1 MB answers with
                // an empty content field; neither is a file this probe can read.
                if (!data.content || data.type !== 'file') return null;
                return {
                    content: Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf-8'),
                    sha: data.sha ?? '',
                    path,
                    encoding: data.encoding ?? 'base64',
                };
            },
        },
    };
}
