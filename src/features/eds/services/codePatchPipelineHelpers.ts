/**
 * Code-patch pipeline wrappers.
 *
 * The engine in {@link codePatchRegistry} is pure: it operates on a
 * `Map<string, string>` working set and reports per-patch results. The
 * pipeline has two distinct phases where patches apply, each with its own
 * source/sink for the file content the engine mutates:
 *
 *   - **Canonical phase (pre-reset).** Patches against template files like
 *     `head.html`, `scripts/*.js`, `blocks/<canonical-block>/*`. The reset
 *     uses a `fileOverrides: Map<string, string>` that drives the atomic
 *     Git Tree commit. We fetch missing targets from
 *     `raw.githubusercontent.com/{templateOwner}/{templateRepo}/main/{target}`,
 *     run the engine against `fileOverrides`, and the existing reset commit
 *     picks up the patched content. Matches the v1 `applyTemplatePatches`
 *     shape (`f6a7d029^:src/features/eds/services/templatePatchRegistry.ts`).
 *
 *   - **Block phase (post-install).** Patches against installed library
 *     blocks that arrive AFTER the reset (via
 *     `reinstallBlockLibraries` / `pipelineConfigureBlockLibrary`).
 *     We read each target from the destination repo via
 *     {@link GitHubFileOperations.getFileContent}, run the engine,
 *     and write patched files back via
 *     {@link GitHubFileOperations.createOrUpdateFile} (separate
 *     commit per patched file, idempotent via the per-file SHA).
 *
 * Phase routing is by target prefix: anything under `blocks/` is block-phase,
 * everything else is canonical-phase. This is mechanical so a patch author
 * doesn't have to declare phase explicitly — the target tells the story.
 *
 * Both wrappers preserve the engine's per-patch failure discipline
 * (proceed-and-warn, ADR-006 D1): unapplied patches are returned as
 * `applied: false` results for the report helper to surface, not thrown.
 * Engine-level `critical: true` escalation still applies — when a critical
 * patch fails, the engine throws and the wrapper re-throws (the caller
 * decides whether to roll back the reset or just abort the create/reset).
 *
 * @module features/eds/services/codePatchPipelineHelpers
 */

import { applyCodePatches, getCodePatches } from './codePatchRegistry';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types';
import type { CodePatchSource } from '@/types/demoPackages';
import type { CodePatchResult } from './codePatchRegistry';
import type { GitHubFileOperations } from './githubFileOperations';

const BLOCK_TARGET_PREFIX = 'blocks/';

/**
 * Apply canonical-phase code patches (anything NOT under `blocks/`) by
 * fetching template files into `fileOverrides` and running the engine.
 *
 * `fileOverrides` is the same working set the bulk reset commits, so
 * patches compose naturally with other overrides (config.json, fstab.yaml,
 * etc.). When a target file already has an override, the engine works on
 * THAT content — we do not re-fetch and we do not clobber.
 *
 * Returns the engine's per-patch results. Empty array when there are no
 * canonical patches in the requested IDs (the engine fetch is still made,
 * but filtered down to zero).
 */
export async function applyCanonicalCodePatches(
    fileOverrides: Map<string, string>,
    templateOwner: string,
    templateRepo: string,
    patchIds: string[],
    source: CodePatchSource,
    logger: Logger,
): Promise<CodePatchResult[]> {
    if (!patchIds || patchIds.length === 0) return [];

    const allPatches = await getCodePatches(patchIds, source, logger);
    const canonicalPatches = allPatches.filter(p => !p.target.startsWith(BLOCK_TARGET_PREFIX));
    if (canonicalPatches.length === 0) return [];

    // Ensure each canonical patch target is in the working set. Fetch from
    // template raw URL on miss; preserve any pre-existing override. We catch
    // fetch errors silently — the engine will report `applied: false` with
    // a target-not-in-set reason on the subsequent apply pass, which is the
    // unified failure surface (no separate "fetch failed" result shape).
    for (const patch of canonicalPatches) {
        if (fileOverrides.has(patch.target)) continue;
        try {
            const url = `https://raw.githubusercontent.com/${templateOwner}/${templateRepo}/main/${patch.target}`;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });
            if (!response.ok) {
                logger.warn(`[CodePatch] Template fetch ${response.status} for ${patch.target} — patch will report not-applied`);
                continue;
            }
            fileOverrides.set(patch.target, await response.text());
        } catch (error) {
            logger.warn(`[CodePatch] Template fetch error for ${patch.target}: ${(error as Error).message}`);
        }
    }

    // Engine runs on the (now-populated) fileOverrides. Multiple patches per
    // target compose because each apply pass reads + writes the same map key.
    return applyCodePatches(
        fileOverrides,
        canonicalPatches.map(p => p.id),
        source,
        logger,
    );
}

/**
 * Apply block-phase code patches (anything under `blocks/`) by reading
 * each target from the destination repo and writing patched content back.
 *
 * Runs AFTER the block library install so installed blocks are present in
 * the repo to be patched. Each patched file gets its own commit via
 * `createOrUpdateFile` (one per file, not per patch — multiple patches on
 * the same block compose into one final write).
 *
 * Per-file SHA threading lets `createOrUpdateFile` use the update-with-SHA
 * path (idempotent re-runs on a re-reset don't 409). When the destination
 * file is missing entirely, the engine reports `applied: false` with a
 * target-not-in-set reason — no write attempted.
 */
export async function applyBlockCodePatches(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    patchIds: string[],
    source: CodePatchSource,
    logger: Logger,
): Promise<CodePatchResult[]> {
    if (!patchIds || patchIds.length === 0) return [];

    const allPatches = await getCodePatches(patchIds, source, logger);
    const blockPatches = allPatches.filter(p => p.target.startsWith(BLOCK_TARGET_PREFIX));
    if (blockPatches.length === 0) return [];

    // Build the working set by reading each unique target from the destination repo.
    // Track per-target SHAs so the final write uses the update-with-SHA contract.
    const workingSet = new Map<string, string>();
    const targetShas = new Map<string, string>();
    const uniqueTargets = Array.from(new Set(blockPatches.map(p => p.target)));
    for (const target of uniqueTargets) {
        try {
            const file = await githubFileOps.getFileContent(repoOwner, repoName, target);
            if (file?.content !== undefined) {
                workingSet.set(target, file.content);
                if (file.sha) targetShas.set(target, file.sha);
            }
        } catch (error) {
            logger.warn(`[CodePatch] Read ${target} failed: ${(error as Error).message} — patch will report not-applied`);
        }
    }

    // Snapshot the BEFORE content so we can detect which files actually changed
    // (multiple patches per file compose; we want one write per file, only when
    // content differs from the original).
    const beforeContent = new Map(workingSet);

    // Engine runs. Empty working set entries (file missing in repo) → engine
    // returns target-not-in-set non-applied results.
    const results = await applyCodePatches(
        workingSet,
        blockPatches.map(p => p.id),
        source,
        logger,
    );

    // Write back any target whose content changed.
    for (const target of uniqueTargets) {
        const before = beforeContent.get(target);
        const after = workingSet.get(target);
        if (before === undefined || after === undefined || before === after) continue;
        try {
            await githubFileOps.createOrUpdateFile(
                repoOwner,
                repoName,
                target,
                after,
                `chore(demo-builder): apply code patches to ${target}`,
                targetShas.get(target),
            );
            logger.info(`[CodePatch] Wrote patched ${target} to ${repoOwner}/${repoName}`);
        } catch (error) {
            logger.warn(`[CodePatch] Write ${target} failed: ${(error as Error).message}`);
        }
    }

    return results;
}
