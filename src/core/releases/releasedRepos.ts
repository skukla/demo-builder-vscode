/**
 * The repositories the builder directly owns: a push to one reaches no SC until it is
 * released, as with the extension (owner, 2026-11-02). Anything else keeps following its branch,
 * because a release there is not ours to publish.
 *
 * `tests/core/releases/releasedRepos.test.ts` cross-checks this list against the catalogs.
 */

export const RELEASED_REPOS = [
    'skukla/app-builder-shell',
    'skukla/bodea-source',
    'skukla/buildright-eds',
    'skukla/citisignal-nextjs',
    'skukla/commerce-eds-mesh',
    'skukla/commerce-erp-integration',
    'skukla/demo-builder-block-library',
    'skukla/demo-erp',
    'skukla/demo-inspector-sdk',
    'skukla/eds-accs-mesh',
    'skukla/eds-demo-patches',
    'skukla/headless-commerce-mesh',
] as const;

const GITHUB_REPO = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/;

/**
 * The repository named by a clone's remote URL, when it ships by release.
 *
 * @param remoteUrl - An https or ssh GitHub URL, with or without `.git`
 * @returns `owner/repo`, or null for any other repository
 */
export function releasedRepoOf(remoteUrl: string | undefined): string | null {
    const repo = remoteUrl?.trim().match(GITHUB_REPO)?.[1];
    return repo && (RELEASED_REPOS as readonly string[]).includes(repo) ? repo : null;
}
