/**
 * The hook every bulk content publish runs first: refresh the authored-pages sheet where
 * it is already live (EDS-61).
 *
 * A bulk publish previews every DA.live page, and the product page overlay would replace
 * an authored page at a category address that the published `/authored-category-pages.json`
 * does not list. Storefront setup (an Edit that rebuilds), reset (when taking the sheet out
 * failed) and the import path hand this to their publish; republish calls the step itself.
 * Only where the record says Demo Builder published the sheet: writing one opts the site
 * in, which is the category step's to do. Never throws.
 *
 * @module features/eds/services/catalogMenu/authoredSheetRefresh
 */

import { publishAuthoredListStep, type CatalogMenuSite } from './catalogMenuStep';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * @param project - the project, whose record says whether the sheet is live
 * @param site - the storefront
 * @param logger - where a sheet that could not be published is said
 * @param tag - the caller's log prefix
 * @returns the hook, for a pipeline's `beforeContentPublish`
 */
export function authoredSheetRefresh(
    project: Project,
    site: CatalogMenuSite,
    logger: Logger,
    tag: string,
): () => Promise<void> {
    return async () => {
        const problem = await publishAuthoredListStep(project, site, { onlyWhenPublished: true });
        if (problem !== undefined) logger.warn(`${tag} ${problem}`);
    };
}
