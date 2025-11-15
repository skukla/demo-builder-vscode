/**
 * AdobeEntityService Workspace Tests
 *
 * Tests for workspace-related operations in AdobeEntityService.
 * Covers fetching, selecting, and managing workspaces.
 */

import { setupMocks, mockProjects, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateWorkspaceId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Workspaces', () => {
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
        (validateWorkspaceId as jest.Mock).mockImplementation(() => {});

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

    describe('getWorkspaces()', () => {
        it('should fetch workspaces via SDK if initialized', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockSDKClient.isInitialized.mockReturnValue(true);
            const mockSDKGetWorkspaces = jest.fn().mockResolvedValue({
                body: [
                    { id: 'ws1', name: 'Production', title: 'Production' },
                    { id: 'ws2', name: 'Stage', title: 'Stage' },
                ],
            });
            mockSDKClient.getClient.mockReturnValue({ getWorkspacesForProject: mockSDKGetWorkspaces } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await service.getWorkspaces();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('ws1');
            expect(mockSDKGetWorkspaces).toHaveBeenCalledWith('org1', 'proj1'); // SDK uses numeric org ID
        });

        it('should fallback to CLI if SDK fails', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getWorkspacesForProject: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);
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
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
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
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
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
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
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
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
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
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
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

    describe('getCurrentWorkspace()', () => {
        it('should fetch from console.where', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
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
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedWorkspace.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                workspace: { id: 'ws1', name: 'Production' }
            } as ReturnType<typeof mockCacheManager.getCachedConsoleWhere>);

            const result = await service.getCurrentWorkspace();

            expect(result).toBeDefined();
            expect(result?.id).toBe('ws1');
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should return undefined if no workspace data', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
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
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
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

    describe('selectWorkspace()', () => {
        it('should successfully select workspace', async () => {
            const { service, mockCommandExecutor } = testMocks;
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
            const { service } = testMocks;
            (validateWorkspaceId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid workspace ID');
            });

            const result = await service.selectWorkspace('');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
            const { service, mockCommandExecutor } = testMocks;
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
            const { service, mockCommandExecutor } = testMocks;
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

    describe('error handling', () => {
        it('should catch and rethrow errors in getWorkspaces', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await expect(service.getWorkspaces()).rejects.toThrow('Network error');
        });
    });
});