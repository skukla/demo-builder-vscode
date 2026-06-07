/**
 * resolveSiteCodeSource — the general repoless-satellite primitive.
 *
 * Decides where a site's code comes from, keyed on the presence of an `upstream`
 * code reference (NOT on the project's `flow`):
 *
 *   - no upstream  → **canonical**: create a fresh repo from the operator's own coords
 *                    (today's commerce/EDS behavior, unchanged).
 *   - has upstream → **satellite**: reference an existing repo via the Configuration
 *                    Service `code` block; no fork, no Code Sync App install, no
 *                    code-sync verification, no config-push.
 *
 * This is the single primitive shared by two callers — the content satellite (Slice 1,
 * cross-org: `upstream.owner !== githubOwner`) and Adobe Repoless **multisite**
 * (deferred, same-org per-env: `upstream.owner === githubOwner`). Both resolve to
 * `createRepo: false`. Keeping the decision on `upstream` rather than `flow` is what
 * keeps it general — see ADR-003 (Multisite Architecture Seam).
 *
 * `codeOwner`/`codeRepo` feed the existing `buildSiteConfigParams` unchanged;
 * `createRepo` gates the Phase 1 fork.
 */

/** The inputs the code-source decision depends on (parameter-driven per ADR-003). */
export interface SiteCodeSourceInput {
    /** The operator's own GitHub org (the canonical owner when creating a fresh repo). */
    githubOwner: string;
    /** The site's repo name (used as the canonical code repo when no upstream). */
    repoName: string;
    /** When present, the existing repo this site references instead of forking. */
    upstream?: { owner: string; repo: string };
}

/** The resolved code source for a site registration. */
export interface SiteCodeSource {
    /** GitHub owner of the repo whose code the site uses. */
    codeOwner: string;
    /** GitHub repo whose code the site uses. */
    codeRepo: string;
    /** Whether the pipeline must create the repo (canonical) or reference it (satellite). */
    createRepo: boolean;
}

/** Resolve a site's code source from the presence of an upstream code reference. */
export function resolveSiteCodeSource(input: SiteCodeSourceInput): SiteCodeSource {
    if (input.upstream) {
        return { codeOwner: input.upstream.owner, codeRepo: input.upstream.repo, createRepo: false };
    }
    return { codeOwner: input.githubOwner, codeRepo: input.repoName, createRepo: true };
}
