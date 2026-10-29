import {
    pairNameInputs,
    pairNames,
    pairedSystemOf,
    systemWordOf,
    withSystemWord,
} from '@/features/app-builder/services/pairNames';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';

describe('pairNames — the SC names the system; the integration keeps its own name', () => {
    it.each([
        ['JustRite ERP Integration', 'JustRite'],
        ['JustRite Integration ERP', 'JustRite'],
        ['JustRite', 'JustRite'],
        ['  JustRite   erp  ', 'JustRite'],
        ['JustRite integration', 'JustRite'],
        ['Multi-ERP Integration', 'Multi-ERP'],
    ])('%p → "%s ERP", beside the integration\'s own name', (typed, base) => {
        expect(pairNames(typed, 'ERP', 'ERP Integration')).toEqual({
            integration: 'ERP Integration',
            system: `${base} ERP`,
        });
    });

    it.each([[undefined], [''], ['   '], ['ERP Integration'], ['Integration'], ['ERP']])(
        '%p gives the default ERP name',
        (typed) => {
            expect(pairNames(typed, 'ERP', 'ERP Integration')).toEqual({
                integration: 'ERP Integration',
                system: 'Acme ERP',
            });
        },
    );

    it('does not strip the system word from inside a word', () => {
        expect(pairNames('Enterprise', 'ERP', 'ERP Integration').system).toBe('Enterprise ERP');
    });
});

describe('withSystemWord — a system added on its own', () => {
    it.each([
        ['Accuform', 'Accuform ERP'],
        ['Accuform erp', 'Accuform ERP'],
        ['Accuform ERP', 'Accuform ERP'],
        ['ERP', 'ERP'],
        ['', ''],
        ['  ', ''],
    ])('%p → %p', (typed, expected) => {
        expect(withSystemWord(typed, 'ERP')).toBe(expected);
    });
});

describe('pairNameInputs — against the real catalog', () => {
    const catalog = getAppBuilderComponentCatalog();
    const integration = catalog.find((entry) => entry.id === 'erp-integration');
    const system = catalog.find((entry) => entry.id === 'demo-erp');

    it('pairs the ERP integration with the demo ERP', () => {
        expect(integration && pairedSystemOf(integration, catalog)?.id).toBe('demo-erp');
        expect(system && systemWordOf(system)).toBe('ERP');
    });

    it('records both names under the inputs each side deploys from', () => {
        expect(pairNameInputs(integration!, catalog, 'JustRite ERP Integration')).toEqual({
            INTEGRATION_DISPLAY_NAME: integration!.name,
            ERP_DISPLAY_NAME: 'JustRite ERP',
        });
    });

    it('is undefined for an entry that brings no named system', () => {
        expect(pairNameInputs(system!, catalog, 'x')).toBeUndefined();
    });
});
