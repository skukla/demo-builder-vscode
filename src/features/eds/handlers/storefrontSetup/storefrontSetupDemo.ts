/**
 * What an added demo adds to the storefront setup run (shareable-demo step 05):
 * its content site as a source of block example pages. Kept beside the phases so
 * that file stays a phase orchestrator and not a home for every demo rule.
 *
 * Demo Builder's fixes are not decided here. The build step applies every live patch that
 * fits to every storefront, an added demo's included (`storefrontUpToDate.ts`, EDS-64);
 * they used to be applied, offered or dry-checked here (EDS-13f).
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupDemo
 */

import type { AddedDemo } from '@/types/projectFile';

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
