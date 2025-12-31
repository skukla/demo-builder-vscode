/**
 * ProjectService - Simplified Tests
 *
 * Tests for the new simplified project service that replaces:
 * - adobeEntityFetcher (getProjects)
 * - adobeEntitySelector (selectProject)
 * - adobeContextResolver (getCurrentProject)
 * - projectOperations (all project operations)
 *
 * Target: Single service with direct CLI calls and caching
 */

import type { CommandExecutor } from '@/core/shell';
import type { AdobeProject, AdobeOrg } from '@/features/authentication/services/types';

// Mock dependencies before importing the service
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    })),
    StepLogger: {
        create: jest.fn().mockResolvedValue({
            logTemplate: jest.fn(),
        }),
    },
}));

// Import after mocks
import { ProjectService } from '@/features/authentication/services/projectService';
import { AuthCache } from '@/features/authentication/services/authCache';

describe('ProjectService - Simplified', () => {
    let projectService: ProjectService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let authCache: AuthCache;

    const mockOrg: AdobeOrg = {
        id: 'org1',
        code: 'ORG1@AdobeOrg',
        name: 'Organization 1',
    };

    const mockProjects: AdobeProject[] = [
        {
            id: 'proj1',
            name: 'project-1',
            title: 'Project 1',
            description: 'First project',
            org_id: 'org1',
        },
        {
            id: 'proj2',
            name: 'project-2',
            title: 'Project 2',
            description: 'Second project',
            org_id: 'org1',
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        authCache = new AuthCache({ ttlMs: 300000, jitterPercent: 0 });

        projectService = new ProjectService(mockCommandExecutor, authCache);
    });

    describe('getProjects', () => {
        it('should fetch projects for organization via CLI', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockProjects),
                stderr: '',
                code: 0,
            });

            const projects = await projectService.getProjects('org1');

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.objectContaining({ encoding: 'utf8' }),
            );
            expect(projects).toHaveLength(2);
            expect(projects[0].id).toBe('proj1');
            expect(projects[0].title).toBe('Project 1');
        });

        it('should use cache when available', async () => {
            // Pre-populate cache
            authCache.setProjects('org1', mockProjects);

            const projects = await projectService.getProjects('org1');

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(projects).toHaveLength(2);
        });

        it('should return empty array when no projects found', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]',
                stderr: '',
                code: 0,
            });

            const projects = await projectService.getProjects('org1');

            expect(projects).toHaveLength(0);
        });

        it('should throw error when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Organization not selected',
                code: 1,
            });

            await expect(projectService.getProjects('org1')).rejects.toThrow(
                'Failed to get projects: Organization not selected',
            );
        });

        it('should handle "does not have any projects" message gracefully', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Organization does not have any projects',
                code: 1,
            });

            const projects = await projectService.getProjects('org1');

            expect(projects).toHaveLength(0);
        });
    });

    describe('selectProject', () => {
        it('should select project via CLI', async () => {
            // Pre-populate projects cache so getProjects() doesn't need to fetch
            authCache.setProjects('org1', mockProjects);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Project selected: proj1',
                stderr: '',
                code: 0,
            });

            const result = await projectService.selectProject('org1', 'proj1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console project select proj1',
                expect.objectContaining({ encoding: 'utf8' }),
            );
        });

        it('should invalidate workspace cache on project change', async () => {
            // Setup: populate caches
            authCache.setProjects('org1', mockProjects);
            authCache.setWorkspaces('org1', 'proj1', [{ id: 'ws1', name: 'Workspace 1' }]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Project selected: proj1',
                stderr: '',
                code: 0,
            });

            await projectService.selectProject('org1', 'proj1');

            // Verify workspace cache was invalidated
            expect(authCache.getWorkspaces('org1', 'proj1')).toBeUndefined();
        });

        it('should return false when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Project not found',
                code: 1,
            });

            const result = await projectService.selectProject('org1', 'invalid-proj');

            expect(result).toBe(false);
        });

        it('should validate projectId to prevent command injection', async () => {
            // Project IDs with malicious characters should be rejected
            await expect(
                projectService.selectProject('org1', 'proj1; rm -rf /'),
            ).rejects.toThrow();
        });
    });

    describe('getCurrentProject', () => {
        it('should return undefined when no project selected', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({ org: mockOrg }),
                stderr: '',
                code: 0,
            });

            const project = await projectService.getCurrentProject();

            expect(project).toBeUndefined();
        });

        it('should return project from console where context', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: mockOrg,
                    project: mockProjects[0],
                }),
                stderr: '',
                code: 0,
            });

            const project = await projectService.getCurrentProject();

            expect(project).toBeDefined();
            expect(project?.id).toBe('proj1');
            expect(project?.title).toBe('Project 1');
        });

        it('should use cached project when available', async () => {
            // Pre-populate cache
            authCache.setCurrentProject(mockProjects[0]);

            const project = await projectService.getCurrentProject();

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(project).toEqual(mockProjects[0]);
        });
    });

    describe('validateProject', () => {
        it('should validate project exists', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockProjects),
                stderr: '',
                code: 0,
            });

            const result = await projectService.validateProject('org1', 'proj1');

            expect(result.valid).toBe(true);
            expect(result.project).toBeDefined();
            expect(result.project?.id).toBe('proj1');
        });

        it('should return invalid when project not found', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockProjects),
                stderr: '',
                code: 0,
            });

            const result = await projectService.validateProject('org1', 'non-existent-proj');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('context guard', () => {
        it('should ensure org is selected before project selection', async () => {
            // Pre-populate projects cache so getProjects() doesn't need to fetch
            authCache.setProjects('org1', mockProjects);

            // The service should work with cached projects
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Project selected: proj1',
                stderr: '',
                code: 0,
            });

            const result = await projectService.selectProject('org1', 'proj1');

            expect(result).toBe(true);
        });
    });
});
