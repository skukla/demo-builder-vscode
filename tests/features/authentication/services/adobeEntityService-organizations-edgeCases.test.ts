/**
 * AdobeEntityService Organization Edge Cases Tests
 *
 * Tests for auto-selection, CLI context clearing, and edge case scenarios.
 */

import { setupMocks, mockOrgs, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Organizations - Edge Cases', () => {
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

    describe('autoSelectOrganizationIfNeeded()', () => {
        it('should return current org if already selected', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrgs[0]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
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
            mockCommandExecutor.execute
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
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
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
            mockCommandExecutor.execute.mockResolvedValue({
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
            mockCommandExecutor.execute
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
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });
    });

    describe('CLI context clearing when no orgs', () => {
        it('should clear CLI context when SDK returns empty organizations array', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: SDK returns empty array, then falls back to CLI which also returns empty
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            const mockSDKGetOrgs = jest.fn().mockResolvedValue({
                body: [], // Empty orgs array from SDK
            });
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: mockSDKGetOrgs
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Mock CLI calls: first org list (returns empty), then 3 config delete commands
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]', // CLI also returns empty
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                .mockResolvedValue({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });

            (parseJSON as jest.Mock).mockReturnValue([]);

            // Act
            const result = await service.getOrganizations();

            // Assert
            expect(result).toEqual([]); // Empty array returned

            // Verify 4 CLI calls: 1 for org list + 3 for config delete
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(4);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                { encoding: 'utf8' }
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.project',
                { encoding: 'utf8' }
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.workspace',
                { encoding: 'utf8' }
            );

            // Verify cache cleared
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
        });

        it('should clear CLI context when CLI returns empty organizations array', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: SDK not initialized, CLI returns empty array
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false); // Auto-init attempted but failed

            // First call: CLI org list returns empty array
            // Subsequent calls: config delete commands
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]', // Empty orgs from CLI
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                .mockResolvedValue({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });

            (parseJSON as jest.Mock).mockReturnValue([]);

            // Act
            const result = await service.getOrganizations();

            // Assert
            expect(result).toEqual([]);

            // Verify 4 CLI calls: 1 for org list + 3 for config delete
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(4);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                { encoding: 'utf8' }
            );
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
        });

        it('should use Promise.all for parallel execution of config delete commands', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: SDK returns empty array
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] })
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Track when each command is called
            const callTimestamps: number[] = [];
            let callCount = 0;
            mockCommandExecutor.execute.mockImplementation(async (cmd) => {
                callCount++;
                if (callCount === 1) {
                    // First call is org list
                    (parseJSON as jest.Mock).mockReturnValue([]);
                    return { stdout: '[]', stderr: '', code: 0, duration: 1000 };
                }
                // Config delete calls - track timing (parallel calls have same/close timestamps)
                callTimestamps.push(Date.now());
                return { stdout: '', stderr: '', code: 0, duration: 10 };
            });

            // Act
            await service.getOrganizations();

            // Assert: All 3 config delete commands should start within ~10ms of each other (parallel)
            expect(callTimestamps).toHaveLength(3);
            const maxTimeDiff = Math.max(...callTimestamps) - Math.min(...callTimestamps);
            expect(maxTimeDiff).toBeLessThan(50); // Parallel calls start nearly simultaneously
        });

        it('should NOT clear ims context (preserve token)', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: Empty orgs
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] })
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Mock CLI calls: first org list, then config deletes
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]',
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                .mockResolvedValue({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });

            (parseJSON as jest.Mock).mockReturnValue([]);

            // Act
            await service.getOrganizations();

            // Assert: Verify ims context NOT cleared
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('ims'),
                expect.any(Object)
            );
            // Only console.* configs cleared
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                expect.any(Object)
            );
        });

        it('should call clearConsoleWhereCache after CLI clearing completes', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: Empty orgs
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] })
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Track call order
            const callOrder: string[] = [];
            let callCount = 0;
            mockCommandExecutor.execute.mockImplementation(async (cmd) => {
                callCount++;
                if (callCount === 1) {
                    // First call is org list
                    (parseJSON as jest.Mock).mockReturnValue([]);
                    callOrder.push(`cli:${cmd}`);
                    return { stdout: '[]', stderr: '', code: 0, duration: 1000 };
                }
                // Config delete calls
                callOrder.push(`cli:${cmd}`);
                return { stdout: '', stderr: '', code: 0, duration: 100 };
            });
            mockCacheManager.clearConsoleWhereCache.mockImplementation(() => {
                callOrder.push('cache:clear');
            });

            // Act
            await service.getOrganizations();

            // Assert: Cache clear happens AFTER all CLI commands (including org list)
            expect(callOrder).toEqual([
                'cli:aio console org list --json',
                expect.stringContaining('console.org'),
                expect.stringContaining('console.project'),
                expect.stringContaining('console.workspace'),
                'cache:clear',
            ]);
        });

        it('should NOT clear CLI context when orgs exist', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: SDK returns non-empty orgs
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            const mockSDKGetOrgs = jest.fn().mockResolvedValue({
                body: [
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: mockSDKGetOrgs
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Act
            const result = await service.getOrganizations();

            // Assert
            expect(result).toHaveLength(1);

            // Verify NO config delete commands called
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('config delete'),
                expect.any(Object)
            );
            expect(mockCacheManager.clearConsoleWhereCache).not.toHaveBeenCalled();
        });

        it('should call clearConsoleWhereCache even if config delete commands fail', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;

            // Arrange: Empty orgs
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] })
            } as ReturnType<typeof mockSDKClient.getClient>);

            // Mock CLI: first org list succeeds, then config deletes fail
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]',
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                .mockResolvedValue({
                    stdout: '',
                    stderr: 'Config not found',
                    code: 1, // Failure
                    duration: 100,
                });

            (parseJSON as jest.Mock).mockReturnValue([]);

            // Act
            const result = await service.getOrganizations();

            // Assert: Should not throw error
            expect(result).toEqual([]);

            // Cache clear should still be called (cleanup proceeds despite failures)
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);
        });
    });
});
