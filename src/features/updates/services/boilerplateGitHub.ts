/**
 * The GitHub reads `boilerplateBase.ts` needs, over the REST API with the SC's token.
 * Every read answers undefined on any failure; the lookup turns that into "GitHub could
 * not be read" rather than a guess.
 *
 * @module features/updates/services/boilerplateGitHub
 */

import type * as vscode from 'vscode';
import { GITHUB_API_BASE, buildGitHubHeaders, fetchWithTimeout } from './githubApiClient';
import type { BoilerplateGitHub } from '@/features/updates/services/boilerplateBase';
import type { RepositoryRef } from '@/types/projectFile';

const PAGE = 100;
/**
 * How far back the first commit is looked for. A colleague's storefront repository has a
 * few dozen commits (kmanns/justrite: 22 on 2026-10-20); one past this answers undefined.
 */
const MAX_PAGES = 10;

interface CommitResponse {
    sha: string;
    parents: unknown[];
    commit: { tree: { sha: string } };
}

/**
 * @param secrets - where the SC's GitHub token is kept
 * @returns the reads
 */
export function createBoilerplateGitHub(secrets: vscode.SecretStorage): BoilerplateGitHub {
    const get = async <T>(path: string): Promise<T | undefined> => {
        try {
            const response = await fetchWithTimeout(`${GITHUB_API_BASE}${path}`, {
                headers: await buildGitHubHeaders(secrets),
            });
            return response.ok ? ((await response.json()) as T) : undefined;
        } catch {
            return undefined;
        }
    };
    const repoPath = (r: RepositoryRef) => `/repos/${r.owner}/${r.repo}`;

    return {
        async repository(repo) {
            const body = await get<{ created_at?: string; template_repository?: { name: string; owner: { login: string } } | null }>(
                repoPath(repo),
            );
            if (!body?.created_at) return undefined;
            const from = body.template_repository;
            return {
                createdAt: body.created_at,
                ...(from ? { templateRepository: { owner: from.owner.login, repo: from.name } } : {}),
            };
        },
        async firstCommitTree(repo) {
            for (let page = 1; page <= MAX_PAGES; page++) {
                const commits = await get<CommitResponse[]>(`${repoPath(repo)}/commits?per_page=${PAGE}&page=${page}`);
                if (!commits) return undefined;
                if (commits.length < PAGE) {
                    return commits.find((c) => c.parents.length === 0)?.commit.tree.sha;
                }
            }
            return undefined;
        },
        async commitsBefore(repo, until) {
            const commits = await get<CommitResponse[]>(
                `${repoPath(repo)}/commits?per_page=${PAGE}&until=${encodeURIComponent(until)}`,
            );
            return commits?.map((c) => ({ sha: c.sha, tree: c.commit.tree.sha }));
        },
        async topLevel(repo, tree) {
            const body = await get<{ tree: Array<{ path: string; sha: string }> }>(`${repoPath(repo)}/git/trees/${tree}`);
            return body ? Object.fromEntries(body.tree.map((e) => [e.path, e.sha])) : undefined;
        },
    };
}
