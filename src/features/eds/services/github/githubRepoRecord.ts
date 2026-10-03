/**
 * One reading of GitHub's repository record (`GET /repos/{owner}/{repo}`),
 * shared by the signed-in reader (`githubRepoOperations.ts`) and the
 * credential-free one (`publicGitHubReads.ts`). Two copies of this mapping
 * existed until EDS-13f added the lineage fields; a field added to one and not
 * the other would have made the shared-demo probe answer differently depending
 * on whether the SC was signed in.
 *
 * @module features/eds/services/github/githubRepoRecord
 */

import type { GitHubRepo } from '../types';

/** A repository GitHub nests inside another's record: only its owner and name are kept. */
interface NestedRepository {
    name: string;
    owner: { login: string };
}

/** The fields of a `GET /repos/{owner}/{repo}` response this extension keeps. */
export interface RepoResponseData {
    /** GitHub's `private`; the colleague-facing checks read it as visibility. */
    private?: boolean;
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    default_branch: string;
    is_template?: boolean;
    /** The template this repository was generated from; null or absent when it was not. */
    template_repository?: NestedRepository | null;
    /** The repository this one is a fork of; present on forks only. */
    parent?: NestedRepository | null;
}

function refOf(nested: NestedRepository | null | undefined): { owner: string; repo: string } | undefined {
    if (!nested?.owner?.login || !nested.name) return undefined;
    return { owner: nested.owner.login, repo: nested.name };
}

/** The repository record as this extension keeps it. Lineage fields appear only when GitHub records one. */
export function toGitHubRepo(data: RepoResponseData): GitHubRepo {
    const templateRepository = refOf(data.template_repository);
    const forkParent = refOf(data.parent);
    return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        htmlUrl: data.html_url,
        cloneUrl: data.clone_url,
        defaultBranch: data.default_branch,
        isTemplate: data.is_template ?? false,
        isPrivate: data.private,
        ...(templateRepository ? { templateRepository } : {}),
        ...(forkParent ? { forkParent } : {}),
    };
}
