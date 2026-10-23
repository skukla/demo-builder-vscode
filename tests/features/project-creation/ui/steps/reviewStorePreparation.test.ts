/**
 * reviewStorePreparation — what the wizard's Review says when Create (or an Edit's Finish)
 * will add the ERP integration, whose add prepares the store (owner, 2026-10-22). Before the
 * project exists nothing can read its store, so Review names the steps from the catalog and
 * which of them change something every website on the Commerce shares; the run checks each
 * first and leaves what is already done.
 */

import { preparesStoreOnAdd } from '@/features/app-builder/services/storePreparation/fixReach';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { storePreparationOnReview } from '@/features/project-creation/ui/steps/reviewStorePreparation';
import type { AppBuilderComponentCatalogEntry, SetupStep } from '@/types/appBuilderComponents';

const step = (id: string, label: string, fix?: SetupStep['fix']): SetupStep => ({ id, title: label, label, why: 'w', where: 'Admin', ...(fix ? { fix } : {}) });
const ERP_INTEGRATION = {
    id: 'erp-integration',
    name: 'ERP Integration',
    kind: 'integration',
    fillsSystem: true,
    setupSteps: [
        step('price-scope', 'Price scope', { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] }),
        step('warehouse', 'Warehouse', { kind: 'handler', handler: 'erp-warehouse-in-website-stock' }),
        step('associate', 'Associate the app'),
    ],
} as AppBuilderComponentCatalogEntry;
const OTHER = { id: 'erp-sync', name: 'ERP Sync', kind: 'integration' } as AppBuilderComponentCatalogEntry;
const CATALOG = [ERP_INTEGRATION, OTHER];

describe('storePreparationOnReview', () => {
    it('names the steps a create will apply, and the ones that reach every website', () => {
        expect(storePreparationOnReview({ selectedAppBuilderComponents: ['erp-integration'] }, CATALOG)).toStrictEqual({
            name: 'ERP Integration',
            steps: ['Price scope', 'Warehouse'],
            everyWebsite: ['Price scope'],
        });
    });

    it('says nothing when nothing selected prepares the store', () => {
        expect(storePreparationOnReview({ selectedAppBuilderComponents: ['erp-sync'] }, CATALOG)).toBeUndefined();
    });

    it('in an Edit, speaks only when the Edit is adding the integration', () => {
        const kept = {
            wizardMode: 'edit' as const,
            selectedAppBuilderComponents: ['erp-integration'],
            editBaseline: { selectedAppBuilderComponents: JSON.stringify(['erp-integration']) },
        };
        const adding = { ...kept, editBaseline: { selectedAppBuilderComponents: JSON.stringify(['erp-sync']) } };

        expect(storePreparationOnReview(kept, CATALOG)).toBeUndefined();
        expect(storePreparationOnReview(adding, CATALOG)).toMatchObject({ name: 'ERP Integration' });
    });

    it("the shipped catalog's ERP integration is one that prepares the store", () => {
        const shipped = getAppBuilderComponentEntry('erp-integration');
        expect(shipped && preparesStoreOnAdd(shipped)).toBe(true);
    });
});
