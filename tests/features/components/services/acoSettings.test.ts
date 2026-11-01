/**
 * The project's ACO settings, read in one place (PL-60): the storefront config and the engine's ACO
 * packs both read them here, so they never disagree about which instance the project uses.
 */

import { ACO_ADDON_ID, acoSettingsProblem, parseAcoInstance, readAcoSettings, usesAco } from '@/features/components/services/acoSettings';

const FULL = {
    ACO_TENANT_ID: 'TenantAbc123',
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

    it('names every empty field', () => {
        const read = readAcoSettings(project({ ...FULL, ACO_CATALOG_VIEW_ID: '', ACO_LOCALE: '' }));
        expect(read).toEqual({ missing: ['ACO_CATALOG_VIEW_ID', 'ACO_LOCALE'] });
        expect(acoSettingsProblem(read)).toBe(
            "The project's Adobe Commerce Optimizer settings are not complete: set ACO_CATALOG_VIEW_ID, ACO_LOCALE in Configure.",
        );
    });

    it('names the instance when what was typed is not one', () => {
        expect(readAcoSettings(project({ ...FULL, ACO_TENANT_ID: 'not an instance' }))).toEqual({ missing: ['ACO_TENANT_ID'] });
    });

    it('reads a pasted address as the instance it names', () => {
        const read = readAcoSettings(project({ ...FULL, ACO_TENANT_ID: 'https://eu1.api.commerce.adobe.com/TenantAbc123/graphql' }));
        expect(read).toMatchObject({ settings: { tenantId: 'TenantAbc123', region: 'eu1', environment: 'production' } });
    });
});

describe('parseAcoInstance', () => {
    it.each([
        ['a sandbox API address', 'https://na1-sandbox.api.commerce.adobe.com/AbC-1/graphql', { tenantId: 'AbC-1', region: 'na1', environment: 'sandbox' }],
        ['a production API address', 'https://na1.api.commerce.adobe.com/AbC-1', { tenantId: 'AbC-1', region: 'na1', environment: 'production' }],
        ['another region', 'https://eu1.api.commerce.adobe.com/AbC-1/', { tenantId: 'AbC-1', region: 'eu1', environment: 'production' }],
        ['a Studio address, which names no region', 'https://experience.adobe.com/#/@org/in:AbC-1/commerce-optimizer-studio/home', { tenantId: 'AbC-1', region: 'na1', environment: 'sandbox' }],
        ['a bare id', '  AbC-1 ', { tenantId: 'AbC-1', region: 'na1', environment: 'sandbox' }],
    ])('reads %s', (_label, raw, expected) => {
        expect(parseAcoInstance(raw)).toEqual(expected);
    });

    it.each([[''], ['https://example.com/AbC-1'], ['two words']])('finds no instance in %j', (raw) => {
        expect(parseAcoInstance(raw)).toBeUndefined();
    });
});
