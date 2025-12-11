/**
 * AdobeEntityService Organization Caching Tests
 *
 * Tests for cache management and retrieval of current organization.
 */

import { setupMocks, mockOrgs, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Organizations - Caching', () => {
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

    describe('getOrganizations() - caching', () => {
        it('should return cached organizations if available', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.getOrganizations();

            expect(result).toEqual(mockOrgs);
            expect(mockCacheManager.getCachedOrgList).toHaveBeenCalledTimes(1);
            expect(mockSDKClient.isInitialized).toHaveBeenCalledTimes(0);
        });
    });

    describe('getCurrentOrganization()', () => {
        it('should return cached organization if available', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            const cachedOrg = { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' };
            mockCacheManager.getCachedOrganization.mockReturnValue(cachedOrg);

            const result = await service.getCurrentOrganization();

            expect(result).toEqual(cachedOrg);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch from console.where if not cached', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({ org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' } }),
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue({ org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' } });

            const result = await service.getCurrentOrganization();

            // Should call Adobe CLI and cache the result
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console where --json',
                expect.any(Object)
            );
            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalled();
        });

        it('should use cached console.where if available', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
            });

            const result = await service.getCurrentOrganization();

            // Should not call CLI since console.where is cached
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should handle string org name by looking up ID from cache', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Organization 1' });
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.getCurrentOrganization();

            // Should resolve ID from cached org list (no SDK init or getOrganizations call)
            expect(mockSDKClient.ensureInitialized).not.toHaveBeenCalled();
            expect(result).toEqual(mockOrgs[0]); // Matched by name
        });

        it('should return name-only org when no cached org list (deferred)', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Test Org' });
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined); // No cached list
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false); // Auto-init attempted but failed
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]', // Empty org list
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([]);

            const result = await service.getCurrentOrganization();

            // SDK auto-init attempted when getOrganizations() is called internally
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
            // Returns name-only org since org list fetch returned empty
            expect(result).toEqual({
                id: 'Test Org',
                code: 'Test Org',
                name: 'Test Org',
            });
        });

        it('should return undefined if no org data', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue({});

            const result = await service.getCurrentOrganization();

            expect(result).toBeUndefined();
        });

        it('should return undefined if CLI command fails', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 100,
            });

            const result = await service.getCurrentOrganization();

            expect(result).toBeUndefined();
        });
    });
});
