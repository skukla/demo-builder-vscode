/**
 * What an update does differently for a thin-layer storefront (ADR-006, EDS-51).
 *
 * A thin-layer storefront is Adobe's boilerplate at the patches repo's last-known-good
 * (LKG) commit, the one the daily gate verified our patches against, plus Demo Builder's
 * layer: those patches, the 404 handling and Quick Edit. An update must keep both halves:
 *
 *  - it goes to the LKG, never to Adobe's latest commit, which nothing has checked;
 *  - it re-applies the patches in the same commit (a patch added to the ledger since the
 *    project was made is applied; one already present is left alone);
 *  - it puts back the 404 handling and Quick Edit if they are missing, and brings the
 *    storefront up to Demo Builder's current fixes (`bringStorefrontUpToDate`);
 *  - it never resets to the bare template, which would drop the layer: the project's
 *    own Reset rebuilds code at the LKG with the layer, and is the way out of a conflict.
 *
 * @module features/updates/services/thinLayerUpdate
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import {
    applyCodePatches,
    CodePatchCriticalError,
    getCodePatches,
    type CodePatchResult,
} from '@/features/eds/services/patches/codePatchRegistry';
import type { LkgSource } from '@/features/eds/services/patches/lkgReader';
import { installQuickEdit } from '@/features/eds/services/quickEditPublisher';
import { extractResetParams, resolveStorefrontConfig } from '@/features/eds/services/reset/edsResetParams';
import { bringStorefrontUpToDate } from '@/features/eds/services/storefront/storefrontUpToDate';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** Whether a recorded value is a usable LKG source. Shape-checked at the read boundary. */
export function isLkgSource(value: unknown): value is LkgSource {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as { owner: unknown; repo: unknown; lkgFile?: unknown };
    if (typeof obj.owner !== 'string' || typeof obj.repo !== 'string') return false;
    if (obj.lkgFile !== undefined && typeof obj.lkgFile !== 'string') return false;
    return true;
}

/** The storefront's recorded LKG source, when it is a thin-layer storefront. */
export function lkgSourceOf(metadata: Record<string, unknown>): LkgSource | undefined {
    return isLkgSource(metadata.lkgSource) ? metadata.lkgSource : undefined;
}

/** Whether a project's storefront is thin-layer: it records an LKG source. */
export function isThinLayerProject(project: Project): boolean {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    return Boolean(metadata && lkgSourceOf(metadata as Record<string, unknown>));
}

export const THIN_LAYER_RESET_REFUSED =
    "This storefront is Adobe's tested boilerplate plus Demo Builder's fixes. Resetting it to the "
    + 'bare template would remove the fixes, so that is not offered. Reset the project instead: it '
    + "rebuilds the code at the tested version with every fix (this replaces your own code edits).";

export const TESTED_VERSION_UNREADABLE =
    'Could not read the tested boilerplate version from the patches repository, so nothing was '
    + 'changed. Try again later.';

/**
 * Re-apply the project's code patches to the files in an update's checkout, so they
 * ride in the update's own commit. A patch whose replacement is already there is left
 * alone; one whose precondition is gone is reported, not forced.
 *
 * @throws TemplateSyncStepError when a `critical` patch cannot be applied: the update
 *         is then not pushed at all.
 */
export async function reapplyPatchesInCheckout(
    repoDir: string,
    project: Project,
    logger: Logger,
): Promise<CodePatchResult[]> {
    const { codePatches, codePatchSource } = resolveStorefrontConfig(project);
    if (!codePatches?.length || !codePatchSource) return [];

    const files = new Map<string, string>();
    for (const patch of await getCodePatches(codePatches, codePatchSource, logger)) {
        if (files.has(patch.target)) continue;
        try {
            files.set(patch.target, await fs.readFile(path.join(repoDir, patch.target), 'utf8'));
        } catch {
            // Not in this storefront: the engine reports it as not applied.
        }
    }
    const before = new Map(files);
    let results: CodePatchResult[];
    try {
        results = await applyCodePatches(files, codePatches, codePatchSource, logger);
    } catch (error) {
        if (error instanceof CodePatchCriticalError) {
            throw new TemplateSyncStepError(
                `A required Demo Builder fix (${error.result.patchId}) no longer fits the updated code, `
                    + 'so the update was not applied. Reset the project to rebuild it at the tested version.',
                error.message,
            );
        }
        throw error;
    }
    for (const [target, content] of files) {
        if (before.get(target) !== content) {
            await fs.writeFile(path.join(repoDir, target), content);
        }
    }
    return results;
}

/** One plain line per patch the update could not put back. */
export function patchesNotPutBack(results: readonly CodePatchResult[]): string[] {
    return results
        .filter((r) => !r.applied)
        .map((r) => `A Demo Builder fix could not be put back: ${r.patchId} (${r.reason ?? 'no reason given'}).`);
}

/**
 * The product-page overlay's address for a storefront: the project row's, then the user's
 * `demoBuilder.byom.*` settings, stamped with the storefront's org and site. In VS Code this is
 * `resolveByomOverlayConfig`, which both resets use; outside it (the patch canary) the row's.
 */
export type OverlayResolver = (fromConfig: string | undefined, org: string, site: string) => string | undefined;

const ROW_OVERLAY: OverlayResolver = (fromConfig) => fromConfig;

/**
 * Put back the 404 handling and Quick Edit if an update left them out, and run the storefront
 * repairs creation and reset run. Each checks for its own markers first, so a storefront that
 * already has them is untouched.
 *
 * The overlay goes through `resolveOverlay`, as a reset's does. Without it every update saw the
 * overlay as off: no first-visit script in 404.html, so Demo Builder's old copy stayed in
 * delayed.js and the Adobe boilerplate update failed on it (JustRite, 2026-10-30).
 *
 * @returns one plain line per piece that could not be put back
 */
export async function restoreDemoBuilderPieces(
    project: Project,
    fileOps: GitHubFileOperations,
    logger: Logger,
    resolveOverlay: OverlayResolver = ROW_OVERLAY,
): Promise<string[]> {
    const extracted = extractResetParams(project);
    if (!extracted.success) return [];
    const { repoOwner, repoName, daLiveOrg, daLiveSite } = extracted.params;
    const byomOverlayUrl = resolveOverlay(extracted.params.byomOverlayUrl, daLiveOrg, daLiveSite);
    const { smart404 } = await bringStorefrontUpToDate(
        fileOps, repoOwner, repoName, byomOverlayUrl, logger, daLiveOrg, daLiveSite,
    );
    const lines: string[] = [];
    if (!smart404.installed && byomOverlayUrl) {
        lines.push(`The missing-product page handling could not be put back: ${smart404.reason ?? 'unknown reason'}.`);
    }
    await installQuickEdit(fileOps, repoOwner, repoName, logger);
    return lines;
}
