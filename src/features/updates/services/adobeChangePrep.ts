/**
 * Get a checkout ready for Adobe's tested boilerplate change: Demo Builder's repairs written
 * into it, then Demo Builder's own pieces set aside, then everything staged so a 3-way apply
 * can run on it.
 *
 * One function for both places the change is applied: the throwaway clone an update pushes
 * from (`templateSyncService.ts`), and the project's local copy where a clash is kept for the
 * SC's AI to fix (`pendingClash.ts`). Each compares its clashes with the other's, so they must
 * prepare identically or a clash kept in one is "not the clash" in the other.
 *
 * Nothing here touches GitHub. The repairs used to run against GitHub before the update knew
 * it would apply, and a stopped update left their commits there (JustRite, 2026-10-30).
 *
 * @module features/updates/services/adobeChangePrep
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import { readShippedPatches } from '@/features/eds/services/patches/shippedPatchLedger';
import { checkoutFiles } from '@/features/updates/services/checkoutFiles';
import { setAsideOwnPieces, type SetAside } from '@/features/updates/services/setAsidePieces';
import type { GitStep } from '@/features/updates/services/templateMergeBase';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import { restoreDemoBuilderPieces, type OverlayResolver } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** What a preparation needs: the checkout, its git, the project, and the overlay lookup. */
export interface AdobeChangePrepDeps {
    dir: string;
    git: GitStep;
    project: Project;
    logger: Logger;
    resolveOverlay?: OverlayResolver;
    /** The live code patches every shipped ledger lists; read from GitHub when not given. */
    readLive?: () => Promise<CodePatch[]>;
}

/** What preparing did: what was set aside, and a plain line per repair that could not be made. */
export interface AdobeChangePrep {
    aside: SetAside;
    lines: string[];
}

/**
 * Demo Builder's repairs (`restoreDemoBuilderPieces`), written into the checkout at `dir`
 * rather than GitHub, so they reach GitHub only with the update's own push.
 *
 * @returns one plain line per piece that could not be put back
 */
export function repairInCheckout(dir: string, project: Project, logger: Logger, resolveOverlay?: OverlayResolver): Promise<string[]> {
    return restoreDemoBuilderPieces(project, checkoutFiles(dir), logger, resolveOverlay);
}

/**
 * Repair, set aside and stage. The repairs first: they take Demo Builder's old scripts out of
 * `scripts/delayed.js`, which Adobe's change deletes (git cannot delete a file that differs).
 *
 * @throws TemplateSyncStepError when the checkout cannot be staged
 */
export async function prepareForAdobeChange(deps: AdobeChangePrepDeps): Promise<AdobeChangePrep> {
    const { dir, git, project, logger } = deps;
    const lines = await repairInCheckout(dir, project, logger, deps.resolveOverlay);
    const live = deps.readLive ? await deps.readLive() : (await readShippedPatches(logger)).live;
    const aside = await setAsideOwnPieces(dir, live);
    if (aside.patches.length > 0 || aside.quickEdit) {
        logger.info(
            `[TemplateSync] Set Demo Builder's own pieces aside for the update: ${[
                ...aside.patches.map((patch) => patch.id),
                ...(aside.quickEdit ? ['Quick Edit wiring'] : []),
            ].join(', ')}`,
        );
    }
    // `git apply --index` needs the index to match the working tree.
    const staged = await git('git add -A', TIMEOUTS.QUICK);
    if (staged.code !== 0) throw new TemplateSyncStepError('Could not prepare the storefront for the update.', staged.stderr);
    return { aside, lines };
}
