/**
 * AdobeEntityService Organization Error Handling Tests
 *
 * Tests for error handling, validation, and failure scenarios.
 */

import { setupMocks, type TestMocks } from './adobeEntityService.testUtils';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

// Mock external dependencies only
jest.mock('@/core/validation/SensitiveDataRedactor');
jest.mock('@/core/validation/validators/AdobeResourceValidator');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging/debugLogger';
import { validateOrgId } from '@/core/validation/validators/AdobeResourceValidator';
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';

describe('AdobeEntityService - Organizations - Error Handling', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        // Mock validation functions (they should not throw by default)
        (validateOrgId as jest.Mock).mockImplementation(() => {});

        // Mock parseJSON
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        testMocks = setupMocks();
    });

    describe('error handling', () => {
        it('should catch and rethrow errors in getOrganizations', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            await expect(service.getOrganizations()).rejects.toThrow('Network error');
        });

        // The factory forwards the optional token check into the fetcher, which
        // consults it before calling a CLI 401 an expired session. Nothing else
        // builds the services WITH a checker, so this is the only place the
        // forwarding is observed: the checker must be the one that was handed in.
        it('forwards isTokenValid to the entity reads, which consult it on a CLI 401', async () => {
            const { mockCommandExecutor, mockSDKClient, mockCacheManager, mockLogger, mockStepLogger } =
                testMocks;
            const isTokenValid = jest.fn().mockResolvedValue(false);
            const { reads } = createEntityServices(
                mockCommandExecutor,
                mockSDKClient,
                mockCacheManager,
                mockLogger,
                mockStepLogger,
                isTokenValid,
            );
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                code: 2,
                stdout: '',
                stderr: ' ›   Error: [CoreConsoleAPISDK] 401 - Unauthorized',
                duration: 0,
            });

            await expect(reads.getOrganizations()).rejects.toThrow(/AUTH_EXPIRED/);
            expect(isTokenValid).toHaveBeenCalledTimes(1);
        });

        // The store is what keeps the API list across a window reload. Handed in
        // here and dropped anywhere on the way down, every reload waits on Adobe.
        it('forwards the store to the org services, which answer from its saved list', async () => {
            const { mockCommandExecutor, mockSDKClient, mockCacheManager, mockLogger, mockStepLogger } =
                testMocks;
            const saved = { services: [{ code: 'GraphQLServiceSDK' }], fetchedAt: Date.now() };
            const store = { get: jest.fn().mockReturnValue(saved), update: jest.fn() };
            const { orgServices } = createEntityServices(
                mockCommandExecutor,
                mockSDKClient,
                mockCacheManager,
                mockLogger,
                mockStepLogger,
                undefined,
                store,
            );

            await expect(orgServices.getServicesForOrg('org-1')).resolves.toEqual(saved.services);
            expect(store.get).toHaveBeenCalledWith('demoBuilder.orgServicesCatalog.org-1');
        });
    });
});
