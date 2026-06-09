/**
 * resolveSiteCodeSource — decide a site's code source from the presence of an
 * `upstream` reference: no upstream → **canonical** (own repo, created fresh);
 * has upstream → **satellite** (references an existing repo, `createRepo: false`).
 *
 * Today this drives one decision (`!createRepo` ≡ "is a satellite"). It returns a
 * typed `{codeOwner, codeRepo, createRepo}` so the same primitive serves both callers
 * in ADR-003's terms: the cross-org content satellite (now) and same-org repoless
 * multisite (deferred), which would consume `codeOwner/codeRepo` per environment.
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
