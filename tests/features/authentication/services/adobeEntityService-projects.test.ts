/**
 * AdobeEntityService Project Tests
 *
 * Tests for project-related operations in AdobeEntityService.
 * Covers fetching, selecting, and managing projects.
 */

import { setupMocks, mockProjects, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateProjectId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Projects', () => {
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
        (validateProjectId as jest.Mock).mockImplementation(() => {});

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

    describe('getProjects()', () => {
        it('should fetch projects via SDK if initialized', async () => {
            const { service, mockCacheManager, mockSDKClient } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockSDKClient.isInitialized.mockReturnValue(false).mockReturnValueOnce(false).mockReturnValue(true);
            mockSDKClient.ensureInitialized.mockResolvedValue(true);
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
            mockSDKClient.getClient.mockReturnValue({ getProjectsForOrg: mockSDKGetProjects } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await service.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('proj1');
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
            expect(mockSDKGetProjects).toHaveBeenCalledWith('org1'); // SDK uses numeric org ID
        });

        it('should fallback to CLI if SDK fails', async () => {
            const { service, mockCacheManager, mockSDKClient, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedOrganization.mockReturnValue({ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);
            mockCommandExecutor.execute.mockResolvedValue({
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
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.any(Object)
            );
        });

        it('should use CLI if SDK not initialized', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false); // Auto-init attempted but failed
            mockCommandExecutor.execute.mockResolvedValue({
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
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled(); // Auto-init was attempted
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });

        it('should return empty array if no projects exist', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'does not have any projects',
                code: 1,
                duration: 100,
            });

            const result = await service.getProjects();

            expect(result).toEqual([]);
        });

        it('should throw error for other CLI failures', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Network error',
                code: 1,
                duration: 100,
            });

            await expect(service.getProjects()).rejects.toThrow('Failed to get projects');
        });

        it('should map projects with title fallback', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
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

    describe('getCurrentProject()', () => {
        it('should return cached project if available', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedProject.mockReturnValue(mockProjects[0]);

            const result = await service.getCurrentProject();

            expect(result).toEqual(mockProjects[0]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch from console.where if not cached', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
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
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith('aio console where --json', expect.any(Object));
        });

        it('should use cached console.where if available', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Project 1', org_id: '123456' }
            } as ReturnType<typeof mockCacheManager.getCachedConsoleWhere>);

            const result = await service.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.id).toBe('proj1');
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should return undefined if no project data', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await service.getCurrentProject();

            expect(result).toBeUndefined();
        });

        it('should return undefined if CLI command fails', async () => {
            const { service, mockCacheManager, mockCommandExecutor } = testMocks;
            mockCacheManager.getCachedProject.mockReturnValue(undefined);
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Error',
                code: 1,
                duration: 100
            });

            const result = await service.getCurrentProject();

            expect(result).toBeUndefined();
        });
    });

    describe('selectProject()', () => {
        it('should successfully select project with context guard', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            // Mock context showing correct org already selected
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', name: 'Organization 1', code: 'ORG1@AdobeOrg' },
            });

            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ org: { id: 'org1', name: 'Organization 1' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('project select')) {
                    return { stdout: 'Project selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('project list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'proj1', name: 'Project 1' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            const result = await service.selectProject('proj1', 'org1');

            expect(result).toBe(true);
        });

        it('should fail if project ID is invalid', async () => {
            const { service, mockCacheManager } = testMocks;

            // Mock context
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', name: 'Organization 1' },
            });

            (validateProjectId as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid project ID');
            });

            const result = await service.selectProject('', 'org1');

            expect(result).toBe(false);
        });

        it('should fail if CLI command fails', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', name: 'Organization 1' },
            });

            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ org: { id: 'org1', name: 'Organization 1' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('project select')) {
                    return { stdout: '', stderr: 'Project not found', code: 1, duration: 100 };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            const result = await service.selectProject('invalid-proj', 'org1');

            expect(result).toBe(false);
        });

        it('should clear cached console.where after successful selection', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                org: { id: 'org1', name: 'Organization 1' },
            });

            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ org: { id: 'org1', name: 'Organization 1' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('project select')) {
                    return { stdout: 'Project selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('project list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'proj1', name: 'Project 1' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            await service.selectProject('proj1', 'org1');

            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should catch and rethrow errors in getProjects', async () => {
            const { service, mockSDKClient, mockCommandExecutor } = testMocks;
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            await expect(service.getProjects()).rejects.toThrow('Network error');
        });
    });
});