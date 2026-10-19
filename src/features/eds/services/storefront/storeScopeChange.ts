/**
 * Remembering that the storefront's store changed (EDS-44).
 *
 * A storefront's product pages (`/products/{urlKey}/{sku}`) and category pages are
 * made for ONE store: the website, store and store view codes in its config.json.
 * When a config republish puts different codes live, those pages still belong to the
 * previous store. The marker `edsStorefrontState.catalogPagesPending` remembers that,
 * on the project and on disk, until a republish replaces them
 * (`storeScopePages.ts`). It survives "Later", a window restart and the mesh deploy's
 * own republish, because it is set where every config republish records what it
 * published (`storefrontRepublishService.ts`).
 *
 * Pure and vscode-free.
 *
 * @module features/eds/services/storefront/storeScopeChange
 */

import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import { detectStorefrontChanges } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import type { Project } from '@/types/base';

type StorefrontState = NonNullable<Project['edsStorefrontState']>;

/** Which store the pages are still for. */
export type CatalogPagesPending = NonNullable<StorefrontState['catalogPagesPending']>;

/** The codes that pick the store, per level: the ACCS key, then the PaaS key. */
const SCOPE = {
    fromWebsiteCode: [ACCS_WEBSITE_CODE, PAAS_WEBSITE_CODE],
    fromStoreCode: [ACCS_STORE_CODE, PAAS_STORE_CODE],
    fromStoreViewCode: [ACCS_STORE_VIEW_CODE, PAAS_STORE_VIEW_CODE],
} as const;

const STORE_SCOPE_KEYS: ReadonlySet<string> = new Set(Object.values(SCOPE).flat());

/**
 * Whether the storefront is still on another store than the project's settings name: the
 * saved store differs from the one last published, or a published store change still owes
 * its page swap. Until the republish, the live site shows the OLD store, so anything that
 * reads the saved store would act on a store the site does not show (EDS-52, 2026-10-19:
 * the new-category offer proposed the Main Website's 11 categories for a live CitiSignal
 * site whose republish was declined).
 *
 * @param project - the project, with its saved settings
 */
export function storeAwaitsRepublish(project: Project): boolean {
    if (project.edsStorefrontState?.catalogPagesPending) return true;
    const { changedEnvVars } = detectStorefrontChanges(project, project.componentConfigs ?? {});
    return isStoreScopeChange(changedEnvVars);
}

/**
 * Whether a set of changed settings moves the storefront to another store.
 *
 * @param changedEnvVars - the setting keys that changed
 */
export function isStoreScopeChange(changedEnvVars: readonly string[]): boolean {
    return changedEnvVars.some((key) => STORE_SCOPE_KEYS.has(key));
}

function codeAt(envVars: Record<string, string>, keys: readonly string[]): string {
    return keys.map((key) => envVars[key]).find(Boolean) ?? '';
}

/**
 * The marker after a config.json that the CDN accepted.
 *
 * @param previous - the storefront state BEFORE this publish recorded its values
 * @param published - the storefront settings this publish put live
 * @returns the marker to keep, or undefined when the pages are the live store's
 */
export function catalogPagesPendingAfter(
    previous: StorefrontState | undefined,
    published: Record<string, string>,
): CatalogPagesPending | undefined {
    // A first publish: there were no pages for any other store.
    if (!previous) return undefined;
    // Still pending: the pages are still the store named there.
    if (previous.catalogPagesPending) return previous.catalogPagesPending;
    const before = previous.envVars ?? {};
    const changed = [...STORE_SCOPE_KEYS].some((key) => (before[key] || '') !== (published[key] || ''));
    if (!changed) return undefined;
    return {
        fromWebsiteCode: codeAt(before, SCOPE.fromWebsiteCode),
        fromStoreCode: codeAt(before, SCOPE.fromStoreCode),
        fromStoreViewCode: codeAt(before, SCOPE.fromStoreViewCode),
    };
}

/** Whether the project's product and category pages are still another store's. */
export function hasCatalogPagesPending(project: Project): boolean {
    return project.edsStorefrontState?.catalogPagesPending !== undefined;
}

/** Forget the marker, in place; the caller saves. */
export function clearCatalogPagesPending(project: Project): void {
    if (project.edsStorefrontState) delete project.edsStorefrontState.catalogPagesPending;
}
