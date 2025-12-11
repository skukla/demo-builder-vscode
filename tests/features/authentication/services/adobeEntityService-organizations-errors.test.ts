/**
 * AdobeEntityService Organization Error Handling Tests
 *
 * Tests for error handling, validation, and failure scenarios.
 */

import { setupMocks, mockOrgs, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Organizations - Error Handling', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

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

    describe('selectOrganization()', () => {
        it('should successfully select organization', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Org selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.selectOrganization('org1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org select org1',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should fail if organization ID is invalid', async () => {
            const { service } = testMocks;
            (validateOrgId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid organization ID');
            });

            const result = await service.selectOrganization('');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Organization not found',
                code: 1,
                duration: 100
            });

            const result = await service.selectOrganization('invalid-org');

            expect(result).toBe(false);
        });

        it('should handle timeout errors gracefully', async () => {
            const { service, mockCommandExecutor } = testMocks;
            mockCommandExecutor.execute.mockRejectedValue(new Error('Timeout'));

            const result = await service.selectOrganization('org1');

            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should catch and rethrow errors in getOrganizations', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            await expect(service.getOrganizations()).rejects.toThrow('Network error');
        });
    });
});
