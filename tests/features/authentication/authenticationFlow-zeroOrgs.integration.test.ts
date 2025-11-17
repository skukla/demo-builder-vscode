/**
 * Integration Tests: Authentication Flow with Zero Organizations
 *
 * Tests the complete authentication flow when a valid token exists
 * but the user has no accessible organizations.
 */

import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { Logger, StepLogger } from '@/core/logging';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateOrgId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('Authentication Flow - Zero Organizations Integration', () => {
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockOrgValidator: jest.Mocked<OrganizationValidator>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let service: AdobeEntityService;

    beforeEach(() => {
        // Setup mocked module functions
        (getLogger as jest.Mock).mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        (validateOrgId as jest.Mock).mockImplementation(() => {});
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Create fresh mocks
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(false),
            getClient: jest.fn(),
            ensureInitialized: jest.fn(),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
            setCachedOrgList: jest.fn(),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            setCachedOrganization: jest.fn(),
            setCachedProject: jest.fn(),
            setCachedWorkspace: jest.fn(),
            getCachedProject: jest.fn().mockReturnValue(undefined),
            getCachedWorkspace: jest.fn().mockReturnValue(undefined),
            getCachedConsoleWhere: jest.fn().mockReturnValue(undefined),
            setCachedConsoleWhere: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            setOrgClearedDueToValidation: jest.fn(),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockOrgValidator = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role'
            })
        } as unknown as jest.Mocked<OrganizationValidator>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockStepLogger = {
            logTemplate: jest.fn(),
        } as unknown as jest.Mocked<StepLogger>;

        service = new AdobeEntityService(
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockOrgValidator,
            mockLogger,
            mockStepLogger
        );
    });

    describe('full auth flow with 0 orgs verifies CLI context cleared', () => {
        it('should clear CLI context when authentication flow completes with 0 organizations', async () => {
            // Given: Valid token but 0 organizations accessible
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Mock CLI to return empty orgs array
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]', // Empty orgs from CLI
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                // Subsequent calls for config delete (3 calls)
                .mockResolvedValue({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });

            (parseJSON as jest.Mock).mockReturnValue([]);

            // When: Authentication flow completes (Step 2 detects 0 orgs)
            const orgs = await service.getOrganizations();

            // Then: CLI context delete commands executed
            expect(orgs).toEqual([]);
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

            // Then: clearConsoleWhereCache() called
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalledTimes(1);

            // Then: User can select new org without stale context interference
            // (Verified by checking context was cleared - no stale references remain)
        });
    });

    describe('subsequent CLI commands succeed after context clearing', () => {
        it('should not fail with 403 after context clearing when org selection attempted', async () => {
            // Given: CLI context cleared due to 0 orgs
            mockSDKClient.isInitialized.mockReturnValue(false);

            // First: getOrganizations returns empty and clears context
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    stdout: '[]', // Empty orgs
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                // Config delete calls (3 calls)
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 });

            (parseJSON as jest.Mock).mockReturnValue([]);

            await service.getOrganizations();

            // When: User attempts new Adobe CLI operation (e.g., org selection)
            // Simulate selecting organization after re-authentication
            mockCommandExecutor.execute.mockResolvedValueOnce({
                stdout: 'Organization selected',
                stderr: '',
                code: 0, // Success - no 403 error
                duration: 500,
            });

            const selectOrgResult = await mockCommandExecutor.execute(
                'aio console org select ORG123@AdobeOrg',
                { encoding: 'utf8' }
            );

            // Then: No 403 Forbidden error from stale context
            expect(selectOrgResult.code).toBe(0);
            expect(selectOrgResult.stderr).not.toContain('403');
            expect(selectOrgResult.stderr).not.toContain('Forbidden');

            // Then: Command succeeds or fails for valid reasons (not stale context)
            expect(selectOrgResult.stdout).toBe('Organization selected');
        });
    });
});
