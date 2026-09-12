/**
 * What an added demo adds to the storefront setup run (shareable-demo step 05):
 * the dry check of the load-bearing patches, and its content site as a source
 * of block example pages. Kept beside the phases so that file stays a phase
 * orchestrator and not a home for every demo rule.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupDemo
 */

import { dryCheckLoadBearingPatches, resolveDryCheckSource } from '../../services/patches/loadBearingPatches';
import type { RepoInfo } from './storefrontSetupTypes';
import type { Logger } from '@/types/logger';
import type { AddedDemo } from '@/types/projectFile';

/**
 * Run the dry check against the demo's code (D4: never patched; D23: each
 * miss becomes a caveat) and record the caveats for the completion card.
 */
export async function dryCheckDemo(
    demo: AddedDemo,
    repoInfo: RepoInfo,
    template: { owner: string; repo: string },
    logger: Logger,
): Promise<void> {
    repoInfo.demoCaveats = await dryCheckLoadBearingPatches(
        { owner: template.owner, repo: template.repo, branch: demo.source.branch ?? 'main' },
        logger,
        resolveDryCheckSource(),
    );
}

/**
 * The demo's own content site joins the library content sources, so its
 * blocks' example pages arrive even when its pages are not copied (D20).
 */
export function withDemoContentSource(
    sources: Array<{ org: string; site: string }>,
    demo: AddedDemo | undefined,
): Array<{ org: string; site: string }> {
    return demo?.contentSource ? [...sources, demo.contentSource] : sources;
}
