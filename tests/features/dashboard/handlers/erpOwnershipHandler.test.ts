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
// The kept read has its own suite; here it passes straight through, so each test reads.
const mockShared = jest.fn((_project: unknown, _id: string, read: () => Promise<unknown>) => read());
jest.mock('@/features/project-creation/services/erpOwnershipOptionsShared', () => ({
    readErpOwnershipOptionsShared: (...a: [unknown, string, () => Promise<unknown>]) => mockShared(...a),
}));

const OPTIONS: ErpOwnershipOptions = {
    websites: [{ code: 'base', name: 'Main Website' }],
    products: [{ sku: 'A', websiteCodes: ['base'], attributes: {} }],
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

    // Without the store the credential is read from Adobe Console on every reload: about two
    // minutes on Justrite, all of it under "Reading the store" (2026-10-18).
    it('hands the read the extension\'s credential store, so a kept credential is used', async () => {
        const { mockContext } = setupMocks(pairProject());

        await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        expect(mockRead.mock.calls[0][4]).toBe(mockContext.context.secrets);
    });

    // So a read the dashboard started when it opened is joined, not repeated.
    it('reads through the kept read for this project and integration', async () => {
        const { mockContext } = setupMocks(pairProject());

        await handleGetErpOwnershipOptions(mockContext, { id: 'erp-integration' });

        expect(mockShared).toHaveBeenCalledTimes(1);
        expect(mockShared.mock.calls[0][1]).toBe('erp-integration');
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
