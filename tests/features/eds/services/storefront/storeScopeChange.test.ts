/**
 * Remembering a store change (EDS-44).
 *
 * When a config republish publishes store codes that differ from the last published ones,
 * the storefront's product and category pages still belong to the OLD store. The marker
 * `edsStorefrontState.catalogPagesPending` remembers that until the pages are rebuilt.
 */

import {
    catalogPagesPendingAfter,
    clearCatalogPagesPending,
    hasCatalogPagesPending,
    isStoreScopeChange,
} from '@/features/eds/services/storefront/storeScopeChange';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

type StorefrontState = NonNullable<Project['edsStorefrontState']>;

const MAIN = {
    ACCS_WEBSITE_CODE: 'base',
    ACCS_STORE_CODE: 'main_website_store',
    ACCS_STORE_VIEW_CODE: 'default',
    ACCS_CUSTOMER_GROUP: 'abc',
};
const CITISIGNAL = {
    ...MAIN,
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_STORE_CODE: 'citisignal_store',
    ACCS_STORE_VIEW_CODE: 'citisignal_us',
};

function published(envVars: Record<string, string>, extra: Partial<StorefrontState> = {}): StorefrontState {
    return { envVars, lastPublished: '2026-10-01T00:00:00.000Z', ...extra };
}

describe('isStoreScopeChange', () => {
    it('is true when a website, store or store view code changed, on either backend', () => {
        expect(isStoreScopeChange(['ACCS_WEBSITE_CODE'])).toBe(true);
        expect(isStoreScopeChange(['ACCS_STORE_CODE'])).toBe(true);
        expect(isStoreScopeChange(['ADOBE_COMMERCE_STORE_VIEW_CODE'])).toBe(true);
    });

    it('is false for a change that leaves the store alone', () => {
        expect(isStoreScopeChange(['ACCS_CUSTOMER_GROUP', 'AEM_ASSETS_ENABLED'])).toBe(false);
        expect(isStoreScopeChange([])).toBe(false);
    });
});

describe('catalogPagesPendingAfter', () => {
    it('names the store published before, when the codes changed', () => {
        expect(catalogPagesPendingAfter(published(MAIN), CITISIGNAL)).toEqual({
            fromWebsiteCode: 'base',
            fromStoreCode: 'main_website_store',
            fromStoreViewCode: 'default',
        });
    });

    it('reads the PaaS keys when that is where the codes were published', () => {
        const paas = {
            ADOBE_COMMERCE_WEBSITE_CODE: 'base',
            ADOBE_COMMERCE_STORE_CODE: 'main',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
        };
        expect(
            catalogPagesPendingAfter(published(paas), { ...paas, ADOBE_COMMERCE_STORE_VIEW_CODE: 'fr' }),
        ).toEqual({ fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' });
    });

    it('sets nothing when only a non-store setting changed', () => {
        expect(catalogPagesPendingAfter(published(MAIN), { ...MAIN, ACCS_CUSTOMER_GROUP: 'xyz' })).toBeUndefined();
    });

    it('sets nothing on a first publish: there were no pages for another store', () => {
        // Older projects and new ones: no published state, so nothing changes for them.
        expect(catalogPagesPendingAfter(undefined, CITISIGNAL)).toBeUndefined();
    });

    it('keeps a marker that is already pending, with the store the pages are still from', () => {
        const pending = { fromWebsiteCode: 'base', fromStoreCode: 'main_website_store', fromStoreViewCode: 'default' };
        // A second publish of the same new codes: the pages are still the old store's.
        expect(catalogPagesPendingAfter(published(CITISIGNAL, { catalogPagesPending: pending }), CITISIGNAL)).toEqual(
            pending,
        );
    });
});

describe('the marker on a project', () => {
    const pending = { fromWebsiteCode: 'base', fromStoreCode: 'main_website_store', fromStoreViewCode: 'default' };

    it('is read from the storefront state', () => {
        expect(hasCatalogPagesPending(createMockProject({ edsStorefrontState: published(CITISIGNAL) }))).toBe(false);
        expect(
            hasCatalogPagesPending(
                createMockProject({ edsStorefrontState: published(CITISIGNAL, { catalogPagesPending: pending }) }),
            ),
        ).toBe(true);
        expect(hasCatalogPagesPending(createMockProject({ edsStorefrontState: undefined }))).toBe(false);
    });

    it('is cleared in place, leaving the rest of the state', () => {
        const project = createMockProject({ edsStorefrontState: published(CITISIGNAL, { catalogPagesPending: pending }) });

        clearCatalogPagesPending(project);

        expect(project.edsStorefrontState).toEqual(published(CITISIGNAL));
        expect(hasCatalogPagesPending(project)).toBe(false);
    });
});
