/**
 * Whether a setup step's fix changes something every website on the Commerce instance shares
 * (owner, 2026-10-22): the add of the ERP integration prepares the store, and on a shared
 * Commerce some of that reaches other demos' websites, so the add's confirm says which.
 *
 * - a settings fix with an item at the default scope: the default applies to every website
 *   that does not override it (the catalog price scope can only be set there);
 * - `create-erp-attributes`: product attributes and attribute sets are instance-wide;
 * - `company-shared-catalogs`: it reads and assigns every company Commerce has;
 * - `erp-warehouse-in-website-stock`: the stock it adds sells to the project's website only.
 *
 * Pure, and imported by the webviews (the add's confirm) as well as the extension.
 *
 * @module features/app-builder/services/storePreparation/fixReach
 */

import type { AppBuilderComponentCatalogEntry, SetupFix, SetupFixHandler } from '@/types/appBuilderComponents';

const HANDLER_REACHES_EVERY_WEBSITE: Record<SetupFixHandler, boolean> = {
    'create-erp-attributes': true,
    'company-shared-catalogs': true,
    'erp-warehouse-in-website-stock': false,
};

/** Whether applying this fix changes something every website on the instance shares. */
export function reachesEveryWebsite(fix: SetupFix): boolean {
    if (fix.kind === 'config') return fix.items.some((item) => item.scope === 'default');
    return HANDLER_REACHES_EVERY_WEBSITE[fix.handler];
}

/**
 * Whether adding this entry prepares the store (the ERP integration): it fills a system, and
 * one of its setup steps has a fix Demo Builder can apply.
 */
export function preparesStoreOnAdd(entry: AppBuilderComponentCatalogEntry): boolean {
    return Boolean(entry.fillsSystem) && (entry.setupSteps ?? []).some((step) => step.fix);
}
