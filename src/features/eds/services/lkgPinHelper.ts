/**
 * LKG pinning helper for the storefront-setup create flow.
 *
 * The reset path (`edsResetRepoHelper.resetRepoToTemplate`) pins to LKG and
 * applies canonical-phase code patches via the bulk Git Tree API. The create
 * path used `generate-from-template` (no ref parameter; always HEAD) and
 * deferred this work as Step 4b — leaving fresh-create storefronts at
 * canonical HEAD without canonical patches applied.
 *
 * This helper closes that gap. It runs AFTER `generate-from-template` (or
 * after an existing-repo selection) and uses the same bulk Tree machinery
 * the reset path uses to:
 *
 *   1. Read the verified LKG SHA from the patches repo via {@link readLkgSha}.
 *   2. Build a `fileOverrides` map with canonical-phase patches applied via
 *      {@link applyCanonicalCodePatches} (fetches template files into the
 *      map, runs the engine).
 *   3. Atomic-commit canonical@LKG + patches via
 *      {@link GitHubFileOperations.resetRepoToTemplate}.
 *
 * Net effect: a fresh create produces a repo byte-identical to what an
 * immediate reset would produce. Create and reset mirror.
 *
 * Failure modes (ADR-006 D1 proceed-and-warn):
 *
 *   - LKG fetch fails → skip pinning, log warn. Storefront stays at template
 *     HEAD; canonical patches don't fire. Next reset reconciles.
 *   - Canonical patch precondition fails → engine records `applied: false`
 *     into the patchReport, caller surfaces via the unified toast.
 *   - GitHub bulk reset fails → re-throws (the same behavior as the reset
 *     path; we can't leave the repo in a partial state).
 *
 * Only runs for thin-layer storefronts (`codePatchSource` present in
 * config). Forked storefronts get neither LKG-pinning nor canonical
 * patches — unchanged from pre-ADR-006 behavior.
 *
 * @module features/eds/services/lkgPinHelper
 */

import { applyCanonicalCodePatches } from './codePatchPipelineHelpers';
import type { GitHubFileOperations } from './githubFileOperations';
import { readLkgSha } from './lkgReader';
import { addCodeResult, type PatchReport } from './patchReportHelper';
import type { CodePatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** Parameters describing a thin-layer pin operation. */
export interface PinRepoToLkgParams {
    /** Owner of the repo to pin (the storefront repo, NOT the template). */
    repoOwner: string;
    /** Name of the repo to pin. */
    repoName: string;
    /** Template repo owner (canonical for thin-layer — e.g. `hlxsites`). */
    templateOwner: string;
    /** Template repo name (canonical for thin-layer — e.g. `aem-boilerplate-commerce`). */
    templateRepo: string;
    /** Code patch IDs to apply (canonical phase — engine filters by target prefix). */
    codePatches: string[];
    /** External code-patch source (e.g. `skukla/eds-demo-patches/citisignal`). */
    codePatchSource: CodePatchSource;
    /** Optional unified patch report to append canonical results to. When omitted,
     *  results are logged but not aggregated into the toast surface. */
    patchReport?: PatchReport;
}

/**
 * Pin a freshly-created (or existing-but-being-reset) storefront repo to
 * the verified LKG SHA with canonical-phase code patches applied.
 *
 * Idempotent — calling against an already-pinned repo produces a no-op
 * commit if nothing changes, or a small diff if canonical advanced and the
 * caller's `templateRef` reflects the new LKG.
 *
 * @returns `true` if the pin completed and the repo is at LKG, `false` if
 *   LKG was unreachable and pinning was skipped (the caller's repo is
 *   still at whatever its current state is — usually template HEAD for a
 *   fresh create, unchanged for an existing repo).
 */
export async function pinRepoToLkg(
    params: PinRepoToLkgParams,
    githubFileOps: GitHubFileOperations,
    logger: Logger,
): Promise<boolean> {
    const {
        repoOwner, repoName,
        templateOwner, templateRepo,
        codePatches, codePatchSource,
        patchReport,
    } = params;

    // Read the verified canonical SHA. If unreachable, fall back to
    // "no pinning" with a warn — the storefront stays at template HEAD and
    // the next reset will reconcile. D1 proceed-and-warn.
    const lkgSha = await readLkgSha(
        { owner: codePatchSource.owner, repo: codePatchSource.repo },
        logger,
    );
    if (!lkgSha) {
        logger.warn(
            `[LKGPin] LKG unreachable for ${codePatchSource.owner}/${codePatchSource.repo} — `
            + `skipping post-create pin for ${repoOwner}/${repoName}. Storefront remains at template HEAD `
            + `(canonical patches won't apply until next reset).`,
        );
        return false;
    }

    logger.info(`[LKGPin] Pinning ${repoOwner}/${repoName} to LKG ${lkgSha.substring(0, 7)} (${codePatchSource.owner}/${codePatchSource.repo})`);

    // Apply canonical-phase patches into a fileOverrides map. The helper
    // fetches each target from the template repo (at canonical main — the
    // archive endpoint doesn't take a SHA for individual file fetches,
    // but that's fine: the preconditions are stable substrings that work
    // against both main and the LKG SHA). The bulk reset below uses the
    // LKG SHA so the overall tree is pinned; only the per-file fetches
    // for patch precondition checking use main.
    const fileOverrides = new Map<string, string>();
    const canonicalResults = await applyCanonicalCodePatches(
        fileOverrides,
        templateOwner, templateRepo,
        codePatches,
        codePatchSource,
        logger,
    );

    // Route canonical results into the shared patch report (when provided)
    // so the orchestrator's `reportUnapplied` call surfaces unapplied
    // canonical patches alongside unapplied block + content patches in one
    // toast.
    if (patchReport) {
        for (const r of canonicalResults) addCodeResult(patchReport, r);
    }

    // Atomic bulk Git Tree commit: download canonical@LKG, apply
    // fileOverrides on top, commit to the target's main. Same machinery
    // the reset path uses — create and reset now produce byte-identical
    // post-conditions.
    const result = await githubFileOps.resetRepoToTemplate(
        templateOwner, templateRepo,
        repoOwner, repoName,
        fileOverrides,
        lkgSha,
    );

    logger.info(`[LKGPin] Pinned ${repoOwner}/${repoName}: ${result.fileCount} files, commit ${result.commitSha.substring(0, 7)}`);
    return true;
}
