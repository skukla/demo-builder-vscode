/**
 * erpOwnershipHandler — `getErpOwnershipOptions`, what "Add another ERP" shows before the add
 * (AB-64). The read itself is the sync service's (its own suite); here the assertions are on
 * what it is HANDED (the project, the integration, the sign-in) and the envelope answered.
 */

import {
    INTEGRATION,
    mockResolveAppManagementAuth,
    pairProject,
    resetErpHandlerMocks,
    setupMocks,
} from './erpIntegrationHandlers.testUtils';
import { handleGetErpOwnershipOptions } from '@/features/dashboard/handlers/erpOwnershipHandler';
import type { ErpOwnershipOptions } from '@/types/erpOwnership';
import { ErrorCode } from '@/types/errorCodes';

const mockRead = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipSync', () => ({
    readErpOwnershipOptionsForProject: (...a: unknown[]) => mockRead(...a),
}));

const OPTIONS: ErpOwnershipOptions = {
    websites: [{ code: 'base', name: 'Main Website' }],
    sources: [],
    products: [{ sku: 'A', websiteCodes: ['base'], sourceCodes: [], attributes: {} }],
    erps: [{ erp: 'nordwind', name: 'Nordwind', owns: { mode: 'all' } }],
    takenListIds: ['nordwind'],
};

beforeEach(() => {
    resetErpHandlerMocks();
    mockRead.mockResolvedValue(OPTIONS);
});

describe('getErpOwnershipOptions', () => {
    it('reads the options for the integration with the sign-in, and answers them', async () => {
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        const [project, integrationId, auth] = mockRead.mock.calls[0];
        expect(project.appBuilderComponents['erp-integration']).toMatchObject({ name: INTEGRATION.name });
        expect(integrationId).toBe('erp-integration');
        expect(auth).toEqual({ accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' });
        expect(result).toEqual({ success: true, data: OPTIONS });
    });

    it('answers the refusal when the project has no Commerce credential', async () => {
        mockRead.mockResolvedValue({ refusal: 'No Commerce credential on this project.' });
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({ success: false, error: 'No Commerce credential on this project.' });
    });

    it("answers the reader's words when a read fails", async () => {
        mockRead.mockRejectedValue(new Error('Commerce answered 401 for products'));
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({ success: false, error: 'Could not read what the ERPs own: Commerce answered 401 for products' });
    });

    it('is a typed AUTH_REQUIRED without a sign-in, never a dialog', async () => {
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        const { mockContext } = setupMocks(pairProject());

        const result = await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(mockRead).not.toHaveBeenCalled();
    });
});
