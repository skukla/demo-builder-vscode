/**
 * AdobeEntityService Organization Tests
 *
 * Tests for organization-related operations in AdobeEntityService.
 * Covers fetching, selecting, and auto-selecting organizations.
 */

import { setupMocks, mockOrgs, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Organizations', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue({
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
        it('should return cached organizations if available', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.getOrganizations();

            expect(result).toEqual(mockOrgs);
            expect(mockCacheManager.getCachedOrgList).toHaveBeenCalledTimes(1);
            expect(mockSDKClient.isInitialized).toHaveBeenCalledTimes(0);
        });

        it('should fetch organizations via SDK if initialized', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            const result = await service.getOrganizations();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify(mockOrgs.map(o => ({ id: o.id, code: o.code, name: o.name }))),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue(mockOrgs.map(o => ({ id: o.id, code: o.code, name: o.name })));

            const result = await service.getOrganizations();

            expect(result).toHaveLength(2);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should throw error if CLI fails', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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

    describe('getCurrentOrganization()', () => {
        it('should return cached organization if available', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            const cachedOrg = { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' };
            mockCacheManager.getCachedOrganization.mockReturnValue(cachedOrg);

            const result = await service.getCurrentOrganization();

            expect(result).toEqual(cachedOrg);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should fetch from console.where if not cached', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({ org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' } }),
                stderr: '',
                code: 0,
                duration: 100,
            });
            (parseJSON as jest.Mock).mockReturnValue({ org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' } });

            const result = await service.getCurrentOrganization();

            // Should call Adobe CLI and cache the result
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
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
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
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
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Test Org' });
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined); // No cached list

            const result = await service.getCurrentOrganization();

            // Should return name-only org (deferred ID resolution)
            expect(mockSDKClient.ensureInitialized).not.toHaveBeenCalled();
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 100,
            });

            const result = await service.getCurrentOrganization();

            expect(result).toBeUndefined();
        });
    });

    describe('selectOrganization()', () => {
        it('should successfully select organization', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Org selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.selectOrganization('org1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Timeout'));

            const result = await service.selectOrganization('org1');

            expect(result).toBe(false);
        });
    });

    describe('autoSelectOrganizationIfNeeded()', () => {
        it('should return current org if already selected', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrgs[0]);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should auto-select if only one org exists', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            const singleOrg = mockOrgs.slice(0, 1);
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedOrgList.mockReturnValue(singleOrg);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Mock CLI calls:
            // 1st call: getCurrentOrganization() -> returns invalid JSON so it returns undefined
            // 2nd call: selectOrganization() -> returns success
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: '{}', // Empty console.where response
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: 'Org selected',
                    stderr: '',
                    code: 0,
                    duration: 100
                });

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrgs[0]);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should return undefined if multiple orgs exist', async () => {
            const { service, mockCacheManager } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toBeUndefined();
        });

        it('should skip current check if requested', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            const singleOrg = mockOrgs.slice(0, 1);
            mockCacheManager.getCachedOrgList.mockReturnValue(singleOrg);
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Only one CLI call needed: selectOrganization()
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Org selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.autoSelectOrganizationIfNeeded(true);

            expect(result).toEqual(mockOrgs[0]);
            expect(mockCacheManager.getCachedOrganization).not.toHaveBeenCalled();
        });

        it('should fetch org list if not cached', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            const singleOrg = mockOrgs.slice(0, 1);
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Mock CLI calls:
            // 1st: getCurrentOrganization() calls console.where
            // 2nd: getOrganizations() fetches org list
            // 3rd: selectOrganization() selects the org
            // 4th: selectOrganization() calls getOrganizations() again to cache (since getCachedOrgList still returns undefined)
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: '{}', // Empty console.where response
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: JSON.stringify(singleOrg),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: 'Org selected',
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: JSON.stringify(singleOrg),
                    stderr: '',
                    code: 0,
                    duration: 100
                });

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toBeDefined();
            expect(result).toEqual(mockOrgs[0]);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should catch and rethrow errors in getOrganizations', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await expect(service.getOrganizations()).rejects.toThrow('Network error');
        });
    });
});