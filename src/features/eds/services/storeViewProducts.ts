/**
 * Does a guest see any products in this store view? (EDS-46)
 *
 * One anonymous Catalog Service search, scoped by the same headers the
 * storefront sends (`generateHeaders`, customer group empty), asking only for
 * the count. Run when an SC picks a website, store and store view on ACCS, so a
 * store view whose storefront will be empty says so before it is built on.
 * The release walk built on Main Website, which on the shared Commerce holds no
 * products; nothing said so until the category pages came up empty.
 *
 * READ-ONLY, and it never throws: any failure answers `unknown`, which the
 * callers render as nothing. The warning is a claim, so only a real answer
 * may make it.
 *
 * Two callers: the `check-store-view-products` webview handler (wizard and
 * Configure store pickers) and `create_project`'s store scope.
 *
 * @module features/eds/services/storeViewProducts
 */

import { countAccsCatalogProducts } from './catalogEnumeration';
import type { StoreViewCodes, StoreViewProducts } from '@/types/commerceStore';
import type { Logger } from '@/types/logger';

/** Catalog Service's words for a scope with no search index (see catalogPrewarmService). */
const NO_INDEX = /no index was found/i;

/**
 * Ask Catalog Service how many products one ACCS store view shows a guest.
 *
 * @param endpoint - the ACCS GraphQL endpoint (Catalog Service answers there)
 * @param scope - the website, store and store view codes
 * @param logger - where a failed check is noted (debug only; it is not the SC's problem)
 * @returns `found`, `none`, `no-index`, or `unknown` when the check could not answer
 */
export async function probeStoreViewProducts(
    endpoint: string,
    scope: StoreViewCodes,
    logger: Logger,
): Promise<StoreViewProducts> {
    if (!endpoint) return 'unknown';
    try {
        const total = await countAccsCatalogProducts(endpoint, {
            environmentType: 'accs',
            ...scope,
        });
        return total > 0 ? 'found' : 'none';
    } catch (error) {
        const reason = (error as Error).message;
        if (NO_INDEX.test(reason)) return 'no-index';
        logger.debug(
            `[Store View Products] Could not check ${scope.websiteCode} / ${scope.storeCode} / ` +
                `${scope.storeViewCode}: ${reason}`,
        );
        return 'unknown';
    }
}
