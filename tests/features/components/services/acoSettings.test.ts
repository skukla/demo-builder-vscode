/**
 * The project's ACO settings, read in one place (PL-60): the storefront config and the engine's ACO
 * packs both read them here, so they never disagree about which instance the project uses.
 */

import { ACO_ADDON_ID, acoSettingsProblem, readAcoSettings, usesAco } from '@/features/components/services/acoSettings';

const FULL = {
    ACO_TENANT_ID: 'TenantAbc123',
    ACO_REGION: 'na1',
    ACO_ENVIRONMENT: 'sandbox',
    ACO_CATALOG_VIEW_ID: 'view-1',
    ACO_LOCALE: 'en-US',
};

const project = (values: Record<string, string>, addons = [ACO_ADDON_ID]) => ({ selectedAddons: addons, componentConfigs: { [ACO_ADDON_ID]: values } });

describe('readAcoSettings', () => {
    it('reads nothing when the add-on is off, whatever values are kept', () => {
        expect(usesAco(project(FULL, []))).toBe(false);
        expect(readAcoSettings(project(FULL, []))).toBeUndefined();
        expect(acoSettingsProblem(undefined)).toMatch(/does not use Adobe Commerce Optimizer/u);
    });

    it('reads the instance, catalog view and locale, with no price book when none is set', () => {
        expect(readAcoSettings(project(FULL))).toEqual({
            settings: { tenantId: 'TenantAbc123', region: 'na1', environment: 'sandbox', catalogViewId: 'view-1', locale: 'en-US' },
        });
    });

    it('carries a price book when one is set', () => {
        expect(readAcoSettings(project({ ...FULL, ACO_PRICE_BOOK_ID: ' vip ' }))).toMatchObject({ settings: { priceBookId: 'vip' } });
    });

    it('names every empty field, and an instance type that is neither sandbox nor production', () => {
        const read = readAcoSettings(project({ ...FULL, ACO_CATALOG_VIEW_ID: '', ACO_ENVIRONMENT: 'staging' }));
        expect(read).toEqual({ missing: ['ACO_CATALOG_VIEW_ID', 'ACO_ENVIRONMENT'] });
        expect(acoSettingsProblem(read)).toBe(
            "The project's Adobe Commerce Optimizer settings are not complete: set ACO_CATALOG_VIEW_ID, ACO_ENVIRONMENT in Configure.",
        );
    });
});
