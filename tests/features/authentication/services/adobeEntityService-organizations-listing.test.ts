/**
 * AdobeEntityService Organization Listing Tests
 *
 * Tests for fetching and listing organizations via SDK and CLI fallback.
 */

import { setupMocks, mockOrgs, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Organizations - Listing', () => {
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

    describe('getOrganizations()', () => {
        it('should fetch organizations via SDK if initialized', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            const mockSDKGetOrgs = jest.fn().mockResolvedValue({
                body: [
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                    { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({ getOrganizations: mockSDKGetOrgs } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await service.getOrganizations();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('org1');
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
            expect(mockSDKGetOrgs).toHaveBeenCalled();
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
        });

        it('should fallback to CLI if SDK fails', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            const result = await service.getOrganizations();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false); // SDK init fails
            mockSDKClient.ensureInitialized.mockResolvedValue(false); // Auto-init attempted but failed
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs.map(o => ({ id: o.id, code: o.code, name: o.name }))),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue(mockOrgs.map(o => ({ id: o.id, code: o.code, name: o.name })));

            const result = await service.getOrganizations();

            expect(result).toHaveLength(2);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled(); // Auto-init was attempted
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });

        it('should throw error if CLI fails', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Authentication failed',
                code: 1,
                duration: 100,
            });

            await expect(service.getOrganizations()).rejects.toThrow('Failed to get organizations');
        });

        it('should throw error if response is not an array', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '{"invalid": "format"}',
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue({ invalid: 'format' });

            await expect(service.getOrganizations()).rejects.toThrow('Invalid organizations response format');
        });

        it('should throw error if parseJSON returns null', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'invalid json',
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue(undefined);

            await expect(service.getOrganizations()).rejects.toThrow('Invalid organizations response format');
        });

        it('should log step logger messages', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor, mockStepLogger } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }]),
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }]);

            await service.getOrganizations();

            expect(mockStepLogger.logTemplate).toHaveBeenCalledWith('adobe-setup', 'loading-organizations', {});
            expect(mockStepLogger.logTemplate).toHaveBeenCalledWith('adobe-setup', 'found', expect.any(Object));
        });
    });
});
