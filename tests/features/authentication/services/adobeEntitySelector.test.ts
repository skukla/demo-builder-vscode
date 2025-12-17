/**
 * AdobeEntitySelector Unit Tests
 *
 * Tests selection operations for Adobe entities.
 * These tests verify the selector works correctly in isolation.
 */

import { AdobeEntitySelector } from '@/features/authentication/services/adobeEntitySelector';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { AdobeContextResolver } from '@/features/authentication/services/adobeContextResolver';
import type { Logger, StepLogger } from '@/core/logging';

// Mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/core/validation');

import { getLogger } from '@/core/logging';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';

describe('AdobeEntitySelector', () => {
    let selector: AdobeEntitySelector;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockOrgValidator: jest.Mocked<OrganizationValidator>;
    let mockFetcher: jest.Mocked<AdobeEntityFetcher>;
    let mockResolver: jest.Mocked<AdobeContextResolver>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        // Mock validation functions (they should not throw by default)
        (validateOrgId as jest.Mock).mockImplementation(() => {});
        (validateProjectId as jest.Mock).mockImplementation(() => {});
        (validateWorkspaceId as jest.Mock).mockImplementation(() => {});

        // Create mocks
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockCacheManager = {
            setCachedOrganization: jest.fn(),
            setCachedProject: jest.fn(),
            setCachedWorkspace: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            setOrgClearedDueToValidation: jest.fn(),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockOrgValidator = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            }),
        } as unknown as jest.Mocked<OrganizationValidator>;

        mockFetcher = {
            getOrganizations: jest.fn(),
            getProjects: jest.fn(),
            getWorkspaces: jest.fn(),
        } as unknown as jest.Mocked<AdobeEntityFetcher>;

        mockResolver = {
            getConsoleWhereContext: jest.fn(),
            getCurrentOrganization: jest.fn(),
        } as unknown as jest.Mocked<AdobeContextResolver>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockStepLogger = {
            logTemplate: jest.fn(),
        } as unknown as jest.Mocked<StepLogger>;

        selector = new AdobeEntitySelector(
            mockCommandExecutor,
            mockCacheManager,
            mockOrgValidator,
            mockFetcher,
            mockResolver,
            mockLogger,
            mockStepLogger,
        );
    });

    describe('selectOrganization()', () => {
        it('should select organization and cache result', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Organization selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Test Org' },
            ]);

            const result = await selector.selectOrganization('org1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org select org1',
                expect.any(Object),
            );
            expect(mockCacheManager.setCachedOrganization).toHaveBeenCalled();
            expect(mockCacheManager.setCachedProject).toHaveBeenCalledWith(undefined);
            expect(mockCacheManager.setCachedWorkspace).toHaveBeenCalledWith(undefined);
        });

        it('should test developer permissions after selection', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Organization selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Test Org' },
            ]);

            await selector.selectOrganization('org1');

            expect(mockOrgValidator.testDeveloperPermissions).toHaveBeenCalled();
        });

        it('should return false when permissions check fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Organization selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Test Org' },
            ]);
            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: false,
                error: 'Insufficient permissions',
            });

            const result = await selector.selectOrganization('org1');

            expect(result).toBe(false);
        });

        it('should return false on CLI failure', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
            });

            const result = await selector.selectOrganization('org1');

            expect(result).toBe(false);
        });

        it('should validate orgId before selection', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Organization selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getOrganizations.mockResolvedValue([]);

            await selector.selectOrganization('org1');

            expect(validateOrgId).toHaveBeenCalledWith('org1');
        });
    });

    describe('selectProject()', () => {
        it('should ensure org context before selecting project', async () => {
            mockResolver.getConsoleWhereContext.mockResolvedValue({
                org: { id: 'org1' },
            });
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Project selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getProjects.mockResolvedValue([
                { id: 'proj1', name: 'Test Project', title: 'Test Project' },
            ]);

            const result = await selector.selectProject('proj1', 'org1');

            expect(result).toBe(true);
            expect(mockResolver.getConsoleWhereContext).toHaveBeenCalled();
        });

        it('should re-select org if context drifted', async () => {
            mockResolver.getConsoleWhereContext.mockResolvedValue({
                org: { id: 'different-org' },
            });
            // First call for org selection, second for project
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ stdout: 'Org selected', stderr: '', code: 0 })
                .mockResolvedValueOnce({ stdout: 'Project selected', stderr: '', code: 0 });
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Test Org' },
            ]);
            mockFetcher.getProjects.mockResolvedValue([
                { id: 'proj1', name: 'Test Project', title: 'Test Project' },
            ]);

            const result = await selector.selectProject('proj1', 'org1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(2);
        });

        it('should return false if org context restoration fails', async () => {
            mockResolver.getConsoleWhereContext.mockResolvedValue({
                org: { id: 'different-org' },
            });
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
            });

            const result = await selector.selectProject('proj1', 'org1');

            expect(result).toBe(false);
        });
    });

    describe('selectWorkspace()', () => {
        it('should ensure project context before selecting workspace', async () => {
            mockResolver.getConsoleWhereContext.mockResolvedValue({
                project: { id: 'proj1' },
            });
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Workspace selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getWorkspaces.mockResolvedValue([
                { id: 'ws1', name: 'Production', title: 'Production' },
            ]);

            const result = await selector.selectWorkspace('ws1', 'proj1');

            expect(result).toBe(true);
            expect(mockResolver.getConsoleWhereContext).toHaveBeenCalled();
        });

        it('should cache workspace after selection', async () => {
            mockResolver.getConsoleWhereContext.mockResolvedValue({
                project: { id: 'proj1' },
            });
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Workspace selected',
                stderr: '',
                code: 0,
            });
            mockFetcher.getWorkspaces.mockResolvedValue([
                { id: 'ws1', name: 'Production', title: 'Production' },
            ]);

            await selector.selectWorkspace('ws1', 'proj1');

            expect(mockCacheManager.setCachedWorkspace).toHaveBeenCalled();
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalled();
        });
    });

    describe('autoSelectOrganizationIfNeeded()', () => {
        it('should return current org if already selected', async () => {
            const currentOrg = { id: 'org1', code: 'ORG@AdobeOrg', name: 'Current Org' };
            mockResolver.getCurrentOrganization.mockResolvedValue(currentOrg);

            const result = await selector.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(currentOrg);
            expect(mockFetcher.getOrganizations).not.toHaveBeenCalled();
        });

        it('should skip current check when skipCurrentCheck is true', async () => {
            mockResolver.getCurrentOrganization.mockResolvedValue({ id: 'org1', code: 'ORG', name: 'Org' });
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Single Org' },
            ]);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Org selected',
                stderr: '',
                code: 0,
            });

            const result = await selector.autoSelectOrganizationIfNeeded(true);

            expect(result).toBeDefined();
            expect(mockResolver.getCurrentOrganization).not.toHaveBeenCalled();
            expect(mockFetcher.getOrganizations).toHaveBeenCalled();
        });

        it('should auto-select when only one org available', async () => {
            mockResolver.getCurrentOrganization.mockResolvedValue(undefined);
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Single Org' },
            ]);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Org selected',
                stderr: '',
                code: 0,
            });

            const result = await selector.autoSelectOrganizationIfNeeded();

            expect(result).toBeDefined();
            expect(result?.id).toBe('org1');
        });

        it('should return undefined when multiple orgs available', async () => {
            mockResolver.getCurrentOrganization.mockResolvedValue(undefined);
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' },
                { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Org 2' },
            ]);

            const result = await selector.autoSelectOrganizationIfNeeded();

            expect(result).toBeUndefined();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should return undefined when no orgs available', async () => {
            mockResolver.getCurrentOrganization.mockResolvedValue(undefined);
            mockFetcher.getOrganizations.mockResolvedValue([]);

            const result = await selector.autoSelectOrganizationIfNeeded();

            expect(result).toBeUndefined();
        });
    });

    describe('clearConsoleContext()', () => {
        it('should clear all console config keys', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
            });

            await selector.clearConsoleContext();

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                expect.any(Object),
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.project',
                expect.any(Object),
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.workspace',
                expect.any(Object),
            );
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalled();
        });

        it('should not throw on CLI failure', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('CLI error'));

            // Should not throw
            await expect(selector.clearConsoleContext()).resolves.not.toThrow();
        });
    });
});
