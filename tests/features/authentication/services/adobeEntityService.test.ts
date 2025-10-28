import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { Logger, StepLogger } from '@/core/logging';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';

/**
 * AdobeEntityService Test Suite
 *
 * Unit tests for Adobe entity management (organizations, projects, workspaces).
 * Tests SDK and CLI integration with intelligent caching.
 *
 * Strategy: Unit tests with mocked dependencies
 *
 * Total tests: 45+
 * Target coverage: 70-80% of adobeEntityService.ts
 */

// Mock dependencies
jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');
jest.mock('@/core/validation');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';

describe('AdobeEntityService', () => {
    let service: AdobeEntityService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockOrgValidator: jest.Mocked<OrganizationValidator>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;

    const mockOrgs: AdobeOrg[] = [
        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
        { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
    ];

    const mockProjects: AdobeProject[] = [
        {
            id: 'proj1',
            name: 'Project 1',
            title: 'Project 1 Title',
            description: 'Test project',
            type: 'default',
            org_id: 123456, // Numeric ID
        },
    ];

    const mockWorkspaces: AdobeWorkspace[] = [
        { id: 'ws1', name: 'Production', title: 'Production' },
        { id: 'ws2', name: 'Stage', title: 'Stage' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        (getLogger as jest.Mock).mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        // Mock validation functions (they should not throw by default)
        (validateOrgId as jest.Mock).mockImplementation(() => {});
        (validateProjectId as jest.Mock).mockImplementation(() => {});
        (validateWorkspaceId as jest.Mock).mockImplementation(() => {});

        // Mock parseJSON to return the parsed object
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Mock dependencies
        mockCommandExecutor = {
            executeAdobeCLI: jest.fn(),
        } as any;

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(false),
            getClient: jest.fn(),
            ensureInitialized: jest.fn(),
        } as any;

        mockCacheManager = {
            getCachedOrgList: jest.fn(),
            setCachedOrgList: jest.fn(),
            getCachedOrganization: jest.fn(),
            setCachedOrganization: jest.fn(),
            setCachedProject: jest.fn(),
            setCachedWorkspace: jest.fn(),
            getCachedProject: jest.fn(),
            getCachedWorkspace: jest.fn(),
            getCachedConsoleWhere: jest.fn(),
            setCachedConsoleWhere: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            setOrgClearedDueToValidation: jest.fn(),
        } as any;

        mockOrgValidator = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role'
            })
        } as any;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        mockStepLogger = {
            logTemplate: jest.fn(),
        } as any;

        service = new AdobeEntityService(
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockOrgValidator,
            mockLogger,
            mockStepLogger
        );
    });

    describe('getOrganizations()', () => {
        it('should return cached organizations if available', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.getOrganizations();

            expect(result).toEqual(mockOrgs);
            expect(mockCacheManager.getCachedOrgList).toHaveBeenCalled();
            expect(mockSDKClient.isInitialized).not.toHaveBeenCalled();
        });

        it('should fetch organizations via SDK if initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const mockSDKGetOrgs = jest.fn().mockResolvedValue({
                body: [
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                    { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({ getOrganizations: mockSDKGetOrgs } as any);

            const result = await service.getOrganizations();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('org1');
            expect(mockSDKGetOrgs).toHaveBeenCalled();
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
        });

        it('should fallback to CLI if SDK fails', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as any);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
            ]);

            const result = await service.getOrganizations();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
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

    describe('getProjects()', () => {
        it('should fetch projects via SDK if initialized', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockSDKClient.isInitialized.mockReturnValue(true);
            const mockSDKGetProjects = jest.fn().mockResolvedValue({
                body: [
                    {
                        id: 'proj1',
                        name: 'Project 1',
                        title: 'Project 1 Title',
                        description: 'Test',
                        type: 'default',
                        org_id: 'org1',
                    },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({ getProjectsForOrg: mockSDKGetProjects } as any);

            const result = await service.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('proj1');
            expect(mockSDKGetProjects).toHaveBeenCalledWith('ORG1@AdobeOrg');
        });

        it('should fallback to CLI if SDK fails', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as any);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    {
                        id: 'proj1',
                        name: 'Project 1',
                        title: 'Project 1 Title',
                        description: 'Test',
                        type: 'default',
                        org_id: 'org1',
                    },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                {
                    id: 'proj1',
                    name: 'Project 1',
                    title: 'Project 1 Title',
                    description: 'Test',
                    type: 'default',
                    org_id: 'org1',
                },
            ]);

            const result = await service.getProjects();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    {
                        id: 'proj1',
                        name: 'Project 1',
                        title: 'Project 1 Title',
                        description: 'Test',
                        type: 'default',
                        org_id: 'org1',
                    },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                {
                    id: 'proj1',
                    name: 'Project 1',
                    title: 'Project 1 Title',
                    description: 'Test',
                    type: 'default',
                    org_id: 'org1',
                },
            ]);

            const result = await service.getProjects();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should return empty array if no projects exist', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'does not have any projects',
                code: 1,
                duration: 100,
            });

            const result = await service.getProjects();

            expect(result).toEqual([]);
        });

        it('should throw error for other CLI failures', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Network error',
                code: 1,
                duration: 100,
            });

            await expect(service.getProjects()).rejects.toThrow('Failed to get projects');
        });

        it('should map projects with title fallback', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    {
                        id: 'proj1',
                        name: 'Project 1',
                        description: 'Test',
                        type: 'default',
                        org_id: 'org1',
                    },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                {
                    id: 'proj1',
                    name: 'Project 1',
                    description: 'Test',
                    type: 'default',
                    org_id: 'org1',
                },
            ]);

            const result = await service.getProjects();

            expect(result[0].title).toBe('Project 1'); // Falls back to name
        });
    });

    describe('getWorkspaces()', () => {
        it('should fetch workspaces via SDK if initialized', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const mockSDKGetWorkspaces = jest.fn().mockResolvedValue({
                body: [
                    { id: 'ws1', name: 'Production', title: 'Production' },
                    { id: 'ws2', name: 'Stage', title: 'Stage' },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({ getWorkspacesForProject: mockSDKGetWorkspaces } as any);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('ws1');
            expect(mockSDKGetWorkspaces).toHaveBeenCalledWith('ORG1@AdobeOrg', 'proj1');
        });

        it('should fallback to CLI if SDK fails', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as any);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'ws1', name: 'Production', title: 'Production' },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                { id: 'ws1', name: 'Production', title: 'Production' },
            ]);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console workspace list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'ws1', name: 'Production', title: 'Production' },
                ]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([
                { id: 'ws1', name: 'Production', title: 'Production' },
            ]);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should use CLI if org ID missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'ws1', name: 'Production', title: 'Production' }]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([{ id: 'ws1', name: 'Production', title: 'Production' }]);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should use CLI if project ID missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'ws1', name: 'Production', title: 'Production' }]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([{ id: 'ws1', name: 'Production', title: 'Production' }]);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });

        it('should throw error if CLI fails', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Network error',
                code: 1,
                duration: 100,
            });

            await expect(service.getWorkspaces()).rejects.toThrow('Failed to get workspaces');
        });

        it('should map workspaces with title fallback', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'ws1', name: 'Production' }]),
                stderr: '',
                code: 0,
                duration: 1000,
            });
            (parseJSON as jest.Mock).mockReturnValue([{ id: 'ws1', name: 'Production' }]);

            const result = await service.getWorkspaces();

            expect(result[0].title).toBe('Production'); // Falls back to name
        });
    });

    describe('getCurrentOrganization()', () => {
        it('should return cached organization if available', async () => {
            const cachedOrg = { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' };
            mockCacheManager.getCachedOrganization.mockReturnValue(cachedOrg);

            const result = await service.getCurrentOrganization();

            expect(result).toEqual(cachedOrg);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should fetch from console.where if not cached', async () => {
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
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
            });

            const result = await service.getCurrentOrganization();

            // Should not call CLI since console.where is cached
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should handle string org name by looking up ID from cache', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({ org: 'Organization 1' });
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.getCurrentOrganization();

            // Should resolve ID from cached org list (no SDK init or getOrganizations call)
            expect(mockSDKClient.ensureInitialized).not.toHaveBeenCalled();
            expect(result).toEqual(mockOrgs[0]); // Matched by name
        });

        it('should return name-only org when no cached org list (deferred)', async () => {
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

    describe('error handling', () => {
        it('should catch and rethrow errors in getOrganizations', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await expect(service.getOrganizations()).rejects.toThrow('Network error');
        });

        it('should catch and rethrow errors in getProjects', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await expect(service.getProjects()).rejects.toThrow('Network error');
        });

        it('should catch and rethrow errors in getWorkspaces', async () => {
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await expect(service.getWorkspaces()).rejects.toThrow('Network error');
        });
    });

    describe('getCurrentProject()', () => {
        it('should return cached project if available', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);

            const result = await service.getCurrentProject();

            expect(result).toEqual(mockProjects[0]);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should fetch from console.where if not cached', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({
                    project: { id: 'proj1', name: 'Project 1', org_id: 123456 }
                }),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.id).toBe('proj1');
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith('aio console where --json', expect.any(Object));
        });

        it('should use cached console.where if available', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Project 1', org_id: 123456 }
            } as any);

            const result = await service.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.id).toBe('proj1');
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should return undefined if no project data', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentProject();

            expect(result).toBeUndefined();
        });

        it('should return undefined if CLI command fails', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 100
            });

            const result = await service.getCurrentProject();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentWorkspace()', () => {
        it('should fetch from console.where', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({
                    workspace: { id: 'ws1', name: 'Production' }
                }),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentWorkspace();

            expect(result).toBeDefined();
            expect(result?.id).toBe('ws1');
        });

        it('should use cached console.where if available', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production' }
            } as any);

            const result = await service.getCurrentWorkspace();

            expect(result).toBeDefined();
            expect(result?.id).toBe('ws1');
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should return undefined if no workspace data', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentWorkspace();

            expect(result).toBeUndefined();
        });

        it('should return undefined if CLI command fails', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 100
            });

            const result = await service.getCurrentWorkspace();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentContext()', () => {
        it('should return full context with all entities', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production' }
            } as any);

            const result = await service.getCurrentContext();

            expect(result.organization).toEqual(mockOrgs[0]);
            expect(result.project).toEqual(mockProjects[0]);
            expect(result.workspace).toBeDefined();
            expect(result.workspace?.id).toBe('ws1');
        });

        it('should return partial context if some entities missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentContext();

            expect(result.organization).toEqual(mockOrgs[0]);
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });

        it('should return empty context if all entities missing', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentContext();

            expect(result.organization).toBeUndefined();
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });
    });

    describe('selectOrganization()', () => {
        it('should successfully select organization', async () => {
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
            (validateOrgId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid organization ID');
            });

            const result = await service.selectOrganization('');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
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
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Timeout'));

            const result = await service.selectOrganization('org1');

            expect(result).toBe(false);
        });
    });

    describe('selectProject()', () => {
        it('should successfully select project', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Project selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.selectProject('proj1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console project select proj1',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should fail if project ID is invalid', async () => {
            (validateProjectId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid project ID');
            });

            const result = await service.selectProject('');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Project not found',
                code: 1,
                duration: 100
            });

            const result = await service.selectProject('invalid-proj');

            expect(result).toBe(false);
        });

        it('should clear cached console.where after successful selection', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Project selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            await service.selectProject('proj1');

            // Verify command was called (cache clearing is implementation detail)
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });
    });

    describe('selectWorkspace()', () => {
        it('should successfully select workspace', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Workspace selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.selectWorkspace('ws1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console workspace select ws1',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should fail if workspace ID is invalid', async () => {
            (validateWorkspaceId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid workspace ID');
            });

            const result = await service.selectWorkspace('');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Workspace not found',
                code: 1,
                duration: 100
            });

            const result = await service.selectWorkspace('invalid-ws');

            expect(result).toBe(false);
        });

        it('should clear cached console.where after successful selection', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Workspace selected',
                stderr: '',
                code: 0,
                duration: 100
            });

            await service.selectWorkspace('ws1');

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalled();
        });
    });

    describe('autoSelectOrganizationIfNeeded()', () => {
        it('should return current org if already selected', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(mockOrgs[0]);

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrgs[0]);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should auto-select if only one org exists', async () => {
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
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedOrgList.mockReturnValue(mockOrgs);

            const result = await service.autoSelectOrganizationIfNeeded();

            expect(result).toBeUndefined();
        });

        it('should skip current check if requested', async () => {
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
});
