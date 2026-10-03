/**
 * What an added demo adds to the storefront setup run (shareable-demo step 05,
 * EDS-13f): Demo Builder's fixes against the new repository, and its content
 * site as a source of block example pages. Kept beside the phases so that file
 * stays a phase orchestrator and not a home for every demo rule.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupDemo
 */

import { demoFixLines, runDemoFixPass } from '../../services/patches/demoFixPass';
import type { FixDeps } from '../../services/patches/storefrontFixes';
import type { RepoInfo } from './storefrontSetupTypes';
import type { Logger } from '@/types/logger';
import type { AddedDemo } from '@/types/projectFile';
import type { StorefrontSetupStartPayload } from '@/types/webviewRequests';

/**
 * Run the fix pass for a new project on an added demo (`demoFixPass.ts`: a
 * saved package's fixes applied where they fit, a colleague's offered, or the
 * dry check) against the SC's OWN new repository, and record what the SC reads
 * for the completion card. Nothing for a shipped brand.
 *
 * @param edsConfig - The setup config: the demo row, its source (the template
 *   fields) and whether the SC accepted the fixes (an agent argument; never a default)
 * @param repoInfo - The new repository; its caveats are written here
 * @param fileOps - GitHub reads and the one-commit write
 * @param logger - Patch ids and reasons go here, never to the SC
 */
export async function runDemoFixes(
    edsConfig: Pick<StorefrontSetupStartPayload['edsConfig'], 'demo' | 'templateOwner' | 'templateRepo' | 'applyDemoFixes'>,
    repoInfo: RepoInfo,
    fileOps: FixDeps['fileOps'],
    logger: Logger,
): Promise<void> {
    const { demo, templateOwner, templateRepo } = edsConfig;
    if (!demo || !templateOwner || !templateRepo) return;
    const report = await runDemoFixPass(
        demo,
        { owner: repoInfo.repoOwner, repo: repoInfo.repoName, branch: 'main' },
        { owner: templateOwner, repo: templateRepo },
        { fileOps, logger },
        { applyOffered: edsConfig.applyDemoFixes === true },
    );
    repoInfo.demoCaveats = demoFixLines(report);
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
