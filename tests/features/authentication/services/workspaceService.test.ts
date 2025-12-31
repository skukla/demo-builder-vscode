/**
 * WorkspaceService - Simplified Tests
 *
 * Tests for the new simplified workspace service that replaces:
 * - adobeEntityFetcher (getWorkspaces)
 * - adobeEntitySelector (selectWorkspace)
 * - adobeContextResolver (getCurrentWorkspace)
 * - workspaceOperations (all workspace operations)
 *
 * Target: Single service with direct CLI calls and caching
 */

import type { CommandExecutor } from '@/core/shell';
import type { AdobeWorkspace, AdobeOrg, AdobeProject } from '@/features/authentication/services/types';

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
import { WorkspaceService } from '@/features/authentication/services/workspaceService';
import { AuthCache } from '@/features/authentication/services/authCache';

describe('WorkspaceService - Simplified', () => {
    let workspaceService: WorkspaceService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let authCache: AuthCache;

    const mockOrg: AdobeOrg = {
        id: 'org1',
        code: 'ORG1@AdobeOrg',
        name: 'Organization 1',
    };

    const mockProject: AdobeProject = {
        id: 'proj1',
        name: 'project-1',
        title: 'Project 1',
        org_id: 'org1',
    };

    const mockWorkspaces: AdobeWorkspace[] = [
        { id: 'ws1', name: 'Production', title: 'Production Workspace' },
        { id: 'ws2', name: 'Stage', title: 'Staging Workspace' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        authCache = new AuthCache({ ttlMs: 300000, jitterPercent: 0 });

        workspaceService = new WorkspaceService(mockCommandExecutor, authCache);
    });

    describe('getWorkspaces', () => {
        it('should fetch workspaces for project via CLI', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockWorkspaces),
                stderr: '',
                code: 0,
            });

            const workspaces = await workspaceService.getWorkspaces('org1', 'proj1');

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console workspace list --json',
                expect.objectContaining({ encoding: 'utf8' }),
            );
            expect(workspaces).toHaveLength(2);
            expect(workspaces[0].id).toBe('ws1');
            expect(workspaces[0].name).toBe('Production');
        });

        it('should use cache when available', async () => {
            // Pre-populate cache
            authCache.setWorkspaces('org1', 'proj1', mockWorkspaces);

            const workspaces = await workspaceService.getWorkspaces('org1', 'proj1');

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(workspaces).toHaveLength(2);
        });

        it('should return empty array when no workspaces found', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]',
                stderr: '',
                code: 0,
            });

            const workspaces = await workspaceService.getWorkspaces('org1', 'proj1');

            expect(workspaces).toHaveLength(0);
        });

        it('should throw error when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Project not selected',
                code: 1,
            });

            await expect(workspaceService.getWorkspaces('org1', 'proj1')).rejects.toThrow(
                'Failed to get workspaces: Project not selected',
            );
        });
    });

    describe('selectWorkspace', () => {
        it('should select workspace via CLI', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Workspace selected: ws1',
                stderr: '',
                code: 0,
            });

            const result = await workspaceService.selectWorkspace('org1', 'proj1', 'ws1');

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console workspace select ws1',
                expect.objectContaining({ encoding: 'utf8' }),
            );
        });

        it('should return false when CLI command fails', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Workspace not found',
                code: 1,
            });

            const result = await workspaceService.selectWorkspace('org1', 'proj1', 'invalid-ws');

            expect(result).toBe(false);
        });

        it('should validate workspaceId to prevent command injection', async () => {
            // Workspace IDs with malicious characters should be rejected
            await expect(
                workspaceService.selectWorkspace('org1', 'proj1', 'ws1; rm -rf /'),
            ).rejects.toThrow();
        });

        it('should cache selected workspace after successful selection', async () => {
            // Setup: have workspaces in cache so we can look up the selected one
            authCache.setWorkspaces('org1', 'proj1', mockWorkspaces);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Workspace selected: ws1',
                stderr: '',
                code: 0,
            });

            await workspaceService.selectWorkspace('org1', 'proj1', 'ws1');

            // The service should cache the current workspace
            const cached = authCache.getCurrentWorkspace();
            expect(cached).toBeDefined();
            expect(cached?.id).toBe('ws1');
        });
    });

    describe('getCurrentWorkspace', () => {
        it('should return undefined when no workspace selected', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: mockOrg,
                    project: mockProject,
                }),
                stderr: '',
                code: 0,
            });

            const workspace = await workspaceService.getCurrentWorkspace();

            expect(workspace).toBeUndefined();
        });

        it('should return workspace from console where context', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({
                    org: mockOrg,
                    project: mockProject,
                    workspace: mockWorkspaces[0],
                }),
                stderr: '',
                code: 0,
            });

            const workspace = await workspaceService.getCurrentWorkspace();

            expect(workspace).toBeDefined();
            expect(workspace?.id).toBe('ws1');
            expect(workspace?.name).toBe('Production');
        });

        it('should use cached workspace when available', async () => {
            // Pre-populate cache
            authCache.setCurrentWorkspace(mockWorkspaces[0]);

            const workspace = await workspaceService.getCurrentWorkspace();

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(workspace).toEqual(mockWorkspaces[0]);
        });
    });

    describe('validateWorkspace', () => {
        it('should validate workspace exists', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockWorkspaces),
                stderr: '',
                code: 0,
            });

            const result = await workspaceService.validateWorkspace('org1', 'proj1', 'ws1');

            expect(result.valid).toBe(true);
            expect(result.workspace).toBeDefined();
            expect(result.workspace?.id).toBe('ws1');
        });

        it('should return invalid when workspace not found', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify(mockWorkspaces),
                stderr: '',
                code: 0,
            });

            const result = await workspaceService.validateWorkspace('org1', 'proj1', 'non-existent-ws');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('not found');
        });
    });
});
