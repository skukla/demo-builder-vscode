/**
 * erpSetupTeardown — what Demo Builder set up in Commerce for the ERP integration, undone
 * before it is removed: its ERPs' product tags, erp_owner on the sets it added it to, and
 * "Prepare this store". Removing one ERP clears that ERP's own tags (Justrite, 2026-10-19:
 * the integration's removal left 139 tags, the attribute on 12 sets and the preparation, with
 * nothing left to undo them).
 *
 * The Commerce writers and the preparation engine are mocked; the assertions are on what each
 * is handed, which is what decides what is undone.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const mockOpenCommerce = jest.fn();
const mockWrite = jest.fn();
jest.mock('@/features/project-creation/services/erpAssignProducts', () => ({
    openCommerce: (...a: unknown[]) => mockOpenCommerce(...a),
    writeOwnerValues: (...a: unknown[]) => mockWrite(...a),
}));
const mockList = jest.fn();
jest.mock('@/features/app-builder/services/erpAssignSelection', () => ({
    listAssignableProducts: (...a: unknown[]) => mockList(...a),
}));
const mockRemoveSets = jest.fn();
jest.mock('@/features/app-builder/services/erpOwnerAttributeSets', () => ({
    removeOwnerFromSets: (...a: unknown[]) => mockRemoveSets(...a),
}));
const mockUndoPreparation = jest.fn();
jest.mock('@/features/app-builder/services/storePreparation/storePreparationEngine', () => ({
    undoPreparation: (...a: unknown[]) => mockUndoPreparation(...a),
}));
jest.mock('@/features/dashboard/services/setupCheckReader', () => ({
    erpNamesOf: () => ['Justrite ERP', 'Accuform ERP'],
    setupCheckReader: async () => ({ read: jest.fn(), scope: { websiteCode: 'justrite' } }),
}));
jest.mock('@/features/components/services/appBuilderComponentLinks', () => ({
    systemsUsedBy: (_project: unknown, id: string) => (id === 'erp-integration' ? ['demo-erp', 'demo-erp-2'] : []),
}));
jest.mock('@/features/app-builder/services/erpList', () => ({
    erpListIdOf: (_project: unknown, id: string) => ({ 'demo-erp': 'justrite', 'demo-erp-2': 'accuform' } as Record<string, string>)[id],
}));
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: () => [],
    getAppBuilderComponentEntry: () => ({ setupSteps: [{ id: 'price-scope-website' }] }),
}));

import { undoErpSetup } from '@/features/dashboard/handlers/erpSetupTeardown';
import type { ErpOwnerSetsRecord } from '@/types/erpAssign';
import type { StorePreparationRecord } from '@/types/storePreparation';

const COMMERCE = { get: jest.fn(), send: jest.fn() };
const SETS: ErpOwnerSetsRecord = { at: 'then', sets: [{ id: 10, name: 'Accessories' }] };
const PREPARED: StorePreparationRecord = { at: 'then', steps: { 'price-scope-website': { kind: 'config', previous: [] } } };

function project() {
    return createMockProject({
        appBuilderComponents: {
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 's', repo: 'erp' }, erpOwnerSets: SETS, storePreparation: PREPARED },
            'demo-erp': { kind: 'system', status: 'deployed', usedBy: 'erp-integration', source: { owner: 's', repo: 'demo-erp' } },
            'demo-erp-2': { kind: 'system', status: 'deployed', usedBy: 'erp-integration', source: { owner: 's', repo: 'demo-erp' } },
            mesh: { kind: 'mesh', status: 'deployed', source: { owner: 's', repo: 'mesh' } },
        },
    });
}

const rows = [
    { sku: 'J1', owner: 'justrite' },
    { sku: 'A1', owner: 'accuform' },
    { sku: 'O1', owner: 'someone-else' },
    { sku: 'N1', owner: '' },
];

beforeEach(() => {
    jest.clearAllMocks();
    mockOpenCommerce.mockResolvedValue(COMMERCE);
    mockList.mockResolvedValue(rows);
    mockWrite.mockResolvedValue({ total: 2, complete: 2, failed: [], open: 0 });
    mockRemoveSets.mockResolvedValue({ changed: SETS.sets });
    mockUndoPreparation.mockResolvedValue({ reports: [{ title: 'Price scope', state: 'undone', rejected: [] }], record: undefined, checks: {} });
});

const report = jest.fn();

describe('undoErpSetup', () => {
    it("for the integration: clears its ERPs' tags, takes erp_owner out of its sets, then undoes the preparation", async () => {
        const out = await undoErpSetup(createMockHandlerContext(), project(), 'erp-integration', report);

        // Only its own ERPs' tags; another value and an untagged product are left.
        expect(mockWrite).toHaveBeenCalledWith(COMMERCE, [{ sku: 'J1', value: '' }, { sku: 'A1', value: '' }], expect.any(Object));
        expect(mockRemoveSets).toHaveBeenCalledWith(COMMERCE.send, SETS.sets);
        expect(mockUndoPreparation).toHaveBeenCalledWith([{ id: 'price-scope-website' }], PREPARED, expect.objectContaining({ commerce: COMMERCE, websiteCode: 'justrite' }));
        // In that order: a set takes its values with the attribute, and waits for no tag.
        expect(mockWrite.mock.invocationCallOrder[0]).toBeLessThan(mockRemoveSets.mock.invocationCallOrder[0]);
        expect(out).toStrictEqual({
            done: ['Cleared the erp_owner tag on 2 products.', 'Took erp_owner out of 1 attribute set.', 'Undid 1 demo setup step.'],
            failed: [],
        });
    });

    it('for one ERP: clears only its own tags, and leaves the sets and the preparation', async () => {
        await undoErpSetup(createMockHandlerContext(), project(), 'demo-erp-2', report);

        expect(mockWrite).toHaveBeenCalledWith(COMMERCE, [{ sku: 'A1', value: '' }], expect.any(Object));
        expect(mockRemoveSets).not.toHaveBeenCalled();
        expect(mockUndoPreparation).not.toHaveBeenCalled();
    });

    it('CONTROL: for anything else, does nothing and opens no Commerce', async () => {
        expect(await undoErpSetup(createMockHandlerContext(), project(), 'mesh', report)).toBeUndefined();
        expect(mockOpenCommerce).not.toHaveBeenCalled();
    });

    it("says what it could not undo: Commerce's refusal, a tag left, a step refused", async () => {
        mockOpenCommerce.mockResolvedValueOnce({ refusal: 'No Commerce access.' });
        expect(await undoErpSetup(createMockHandlerContext(), project(), 'erp-integration', report)).toStrictEqual({ done: [], failed: ['No Commerce access.'] });

        mockWrite.mockResolvedValueOnce({ total: 2, complete: 1, failed: [{ index: 0, message: 'no' }], open: 0 });
        mockUndoPreparation.mockResolvedValueOnce({ reports: [{ title: 'Price scope', state: 'rejected', rejected: ['Commerce said no.'] }], record: PREPARED, checks: {} });
        const out = await undoErpSetup(createMockHandlerContext(), project(), 'erp-integration', report);
        expect(out?.failed).toStrictEqual([
            '1 product keeps its erp_owner tag.',
            'Some of the demo setup was not undone (Price scope: Commerce said no.).',
        ]);
    });
});
