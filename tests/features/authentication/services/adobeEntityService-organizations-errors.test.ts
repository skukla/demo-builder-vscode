/**
 * AdobeEntityService Organization Error Handling Tests
 *
 * Tests for error handling, validation, and failure scenarios.
 */

import { setupMocks, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
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
    });
});
