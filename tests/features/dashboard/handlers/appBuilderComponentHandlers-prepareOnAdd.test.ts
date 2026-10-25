/**
 * appBuilderComponentHandlers — adding the ERP integration prepares the store (owner,
 * 2026-10-22), so its add is confirmed first: WITHOUT `confirm` it answers what the
 * preparation will change in the store, read now, and adds nothing; WITH it, the add runs.
 * Every other entry adds as before, with no preview. Asserted on what the add does and
 * what the preview is HANDED.
 */

const mockPreviewStoreForAdd = jest.fn();
jest.mock('@/features/project-creation/services/erpStorePreparation', () => ({
    previewStoreForAdd: (...a: unknown[]) => mockPreviewStoreForAdd(...a),
}));

import {
    ERP_ENTRY,
    handleAddAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockGetAppBuilderComponentEntry,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import type { SetupStep } from '@/types/appBuilderComponents';

const FIX_STEP: SetupStep = { id: 'price-scope', title: 'Prices', why: 'w', where: 'Admin', fix: { kind: 'config', items: [] } };
const PREPARING = { ...ERP_ENTRY, id: 'erp-integration', name: 'ERP Integration', fillsSystem: true, setupSteps: [FIX_STEP] };
const PREVIEW = {
    steps: [{ id: 'price-scope', label: 'Price scope', title: 'Prices', state: 'applicable', changes: ['catalog/price/scope: 0 → 1'], rejected: [] }],
    everyWebsite: ['Price scope'],
};

beforeEach(() => {
    resetHandlerMocks();
    mockGetAppBuilderComponentEntry.mockReturnValue(PREPARING);
    mockPreviewStoreForAdd.mockResolvedValue(PREVIEW);
});

describe('adding the ERP integration', () => {
    it('without confirm, answers what the store preparation will change and adds nothing', async () => {
        const { mockContext } = setupMocks();

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockPreviewStoreForAdd).toHaveBeenCalledWith(
            expect.objectContaining({ name: expect.any(String) }),
            PREPARING,
            expect.objectContaining({ authManager: mockContext.authManager }),
        );
        expect(result).toStrictEqual({
            success: true,
            data: {
                confirmed: false,
                adding: { id: 'erp-integration', name: 'ERP Integration' },
                preparation: PREVIEW,
                next: 'Show the user what the store preparation changes, then call again with confirm: true.',
            },
        });
    });

    it('still previews when the store cannot be read now, saying why, so the add stays possible', async () => {
        mockPreviewStoreForAdd.mockResolvedValue({ refusal: 'Sign in to Adobe first.' });
        const { mockContext } = setupMocks();

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: true, data: { confirmed: false, preparation: { unread: 'Sign in to Adobe first.' } } });
    });

    it('with confirm, adds', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-integration', confirm: true });

        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
        expect(mockPreviewStoreForAdd).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('CONTROL: an entry that prepares nothing adds without a confirm, as before', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(ERP_ENTRY);
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
        expect(mockPreviewStoreForAdd).not.toHaveBeenCalled();
    });
});
