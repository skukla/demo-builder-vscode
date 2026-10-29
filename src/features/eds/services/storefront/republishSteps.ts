/**
 * A Republish's steps, in the order they run (progress vocabulary slice 3, owner
 * 2026-10-16), for the "(n of N)" the dashboard shows beside each.
 *
 * ORDER IS LOAD-BEARING: a step's position is its index here, so the list follows
 * `republishStorefrontContent` (and the requirements check the dashboard runs before
 * it). The list is known before the run starts: whether the store changed is on the
 * project already (`catalogPagesPending`). A step with nothing to do (no DA.live email
 * for the permissions, no product pages to warm, a config the CDN did not take so the
 * store-change pages wait) is skipped and the count moves on.
 *
 * @module features/eds/services/storefront/republishSteps
 */

import { hasCatalogPagesPending } from './storeScopeChange';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { Project } from '@/types/base';

const S = OPERATION_STAGES;

/**
 * Every step a Republish of `project` will report, in order.
 *
 * @param project - the project about to be republished
 * @returns the step names: ten, eleven when the store changed
 */
export function republishSteps(project: Project): string[] {
    return [
        S.checkingRequirements.label,
        S.applyingDaLiveSettings.label,
        S.publishingSettings.label,
        S.publishingCode.label,
        S.settingSitePermissions.label,
        S.clearingCache.label,
        S.publishingPages.label,
        // After a store change the old store's product pages go first (EDS-44).
        ...(hasCatalogPagesPending(project) ? [S.removingProductPages.label] : []),
        S.updatingCatalogMenu.label,
        S.warmingProductPages.label,
        S.checkingSettings.label,
    ];
}
