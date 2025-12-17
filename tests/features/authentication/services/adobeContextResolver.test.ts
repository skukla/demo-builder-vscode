/**
 * AdobeContextResolver Unit Tests
 *
 * Tests context resolution from Adobe CLI (console.where).
 * These tests verify the resolver works correctly in isolation.
 */

import { AdobeContextResolver } from '@/features/authentication/services/adobeContextResolver';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';

// Mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeContextResolver', () => {
    let resolver: AdobeContextResolver;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockFetcher: jest.Mocked<AdobeEntityFetcher>;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        // Mock parseJSON
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Create mocks
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            setCachedOrganization: jest.fn(),
            getCachedProject: jest.fn().mockReturnValue(undefined),
            setCachedProject: jest.fn(),
            getCachedWorkspace: jest.fn().mockReturnValue(undefined),
            setCachedWorkspace: jest.fn(),
            getCachedConsoleWhere: jest.fn().mockReturnValue(undefined),
            setCachedConsoleWhere: jest.fn(),
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockFetcher = {
            getOrganizations: jest.fn(),
            getProjects: jest.fn(),
            getWorkspaces: jest.fn(),
        } as unknown as jest.Mocked<AdobeEntityFetcher>;

        resolver = new AdobeContextResolver(
            mockCommandExecutor,
            mockCacheManager,
            mockFetcher,
        );
    });

    describe('getConsoleWhereContext()', () => {
        it('should return cached context if available', async () => {
            const cachedContext = {
                org: { id: 'org1', name: 'Test Org' },
                project: { id: 'proj1', name: 'Test Project' },
            };
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(cachedContext);

            const result = await resolver.getConsoleWhereContext();

            expect(result).toEqual(cachedContext);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch context from CLI when not cached', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: { id: 'org1', name: 'CLI Org', code: 'ORG@AdobeOrg' },
                    project: { id: 'proj1', name: 'CLI Project' },
                }),
                stderr: '',
                code: 0,
            });

            const result = await resolver.getConsoleWhereContext();

            expect(result).toBeDefined();
            expect(result?.org).toBeDefined();
            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalled();
        });

        it('should return undefined on CLI failure', async () => {
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
            });

            const result = await resolver.getConsoleWhereContext();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentOrganization()', () => {
        it('should return cached organization if available', async () => {
            const cachedOrg = { id: 'org1', code: 'ORG@AdobeOrg', name: 'Cached Org' };
            mockCacheManager.getCachedOrganization.mockReturnValue(cachedOrg);

            const result = await resolver.getCurrentOrganization();

            expect(result).toEqual(cachedOrg);
        });

        it('should resolve org from context when org is object', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', code: 'ORG@AdobeOrg', name: 'Context Org' },
            });

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Context Org');
            expect(mockCacheManager.setCachedOrganization).toHaveBeenCalled();
        });

        it('should resolve org ID via fetcher when org is string', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: 'Organization Name',
            });
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockFetcher.getOrganizations.mockResolvedValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Organization Name' },
            ]);

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.id).toBe('org1');
            expect(mockFetcher.getOrganizations).toHaveBeenCalled();
        });

        it('should use cached org list for resolution when available', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: 'Organization Name',
            });
            mockCacheManager.getCachedOrgList.mockReturnValue([
                { id: 'org1', code: 'ORG@AdobeOrg', name: 'Organization Name' },
            ]);

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeDefined();
            expect(result?.id).toBe('org1');
            expect(mockFetcher.getOrganizations).not.toHaveBeenCalled();
        });

        it('should return undefined when no org selected', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({});

            const result = await resolver.getCurrentOrganization();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentProject()', () => {
        it('should return cached project if available', async () => {
            const cachedProject = { id: 'proj1', name: 'Cached Project', title: 'Cached Project' };
            mockCacheManager.getCachedProject.mockReturnValue(cachedProject);

            const result = await resolver.getCurrentProject();

            expect(result).toEqual(cachedProject);
        });

        it('should resolve project from context when project is object', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Context Project', title: 'Context Project Title' },
            });

            const result = await resolver.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Context Project');
            expect(mockCacheManager.setCachedProject).toHaveBeenCalled();
        });

        it('should resolve project ID via fetcher when project is string', async () => {
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: 'Project Name',
            });
            mockFetcher.getProjects.mockResolvedValue([
                { id: 'proj1', name: 'Project Name', title: 'Project Name' },
            ]);

            const result = await resolver.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.id).toBe('proj1');
            expect(mockFetcher.getProjects).toHaveBeenCalledWith({ silent: true });
        });
    });

    describe('getCurrentWorkspace()', () => {
        it('should return cached workspace if available', async () => {
            const cachedWorkspace = { id: 'ws1', name: 'Cached Workspace', title: 'Cached Workspace' };
            mockCacheManager.getCachedWorkspace.mockReturnValue(cachedWorkspace);

            const result = await resolver.getCurrentWorkspace();

            expect(result).toEqual(cachedWorkspace);
        });

        it('should resolve workspace from context when workspace is object', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production', title: 'Production' },
            });

            const result = await resolver.getCurrentWorkspace();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Production');
            expect(mockCacheManager.setCachedWorkspace).toHaveBeenCalled();
        });

        it('should return undefined when workspace is string (not supported)', async () => {
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: 'Production',
            });

            const result = await resolver.getCurrentWorkspace();

            expect(result).toBeUndefined();
        });
    });

    describe('getCurrentContext()', () => {
        it('should aggregate org, project, and workspace', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG', name: 'Org' });
            mockCacheManager.getCachedProject.mockReturnValue({ id: 'proj1', name: 'Project', title: 'Project' });
            mockCacheManager.getCachedWorkspace.mockReturnValue({ id: 'ws1', name: 'Workspace', title: 'Workspace' });

            const result = await resolver.getCurrentContext();

            expect(result.org).toBeDefined();
            expect(result.project).toBeDefined();
            expect(result.workspace).toBeDefined();
        });

        it('should handle partial context', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG', name: 'Org' });
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({});

            const result = await resolver.getCurrentContext();

            expect(result.org).toBeDefined();
            expect(result.project).toBeUndefined();
            expect(result.workspace).toBeUndefined();
        });
    });
});
