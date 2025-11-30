/**
 * AdobeEntityService Context Guard Tests
 *
 * Tests for context drift protection in selectWorkspace and selectProject.
 * These methods now accept optional parent IDs to ensure the CLI context
 * is correct before executing selections (protects against context changes
 * from other processes).
 */

import { setupMocks, type TestMocks } from './adobeEntityService.testUtils';

// Mock external dependencies only
jest.mock('@/core/logging');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { validateProjectId, validateWorkspaceId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityService - Context Guard', () => {
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

    describe('selectWorkspace() with context guard', () => {
        it('should check context and not re-select project when context matches', async () => {
            const { service, mockCommandExecutor, mockCacheManager } = testMocks;

            // Context already has correct project
            mockCacheManager.getCachedConsoleWhere.mockReturnValue({
                project: { id: 'proj1', name: 'Project 1' },
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ project: { id: 'proj1', name: 'Project 1' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('workspace select')) {
                    return { stdout: 'Workspace selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('workspace list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'ws1', name: 'Production' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            const result = await service.selectWorkspace('ws1', 'proj1');

            expect(result).toBe(true);
            // Should NOT call project select since context matches
            const projectSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('project select')
            );
            expect(projectSelectCalls).toHaveLength(0);
        });

        it('should re-select project when context has drifted', async () => {
            const { service, mockCommandExecutor, mockCacheManager } = testMocks;

            // Context has different project (drift)
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ project: { id: 'wrong-proj', name: 'Wrong Project' } }),
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
                if (cmd.includes('workspace select')) {
                    return { stdout: 'Workspace selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('workspace list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'ws1', name: 'Production' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            (parseJSON as jest.Mock).mockImplementation((str: string) => {
                try {
                    return JSON.parse(str);
                } catch {
                    return null;
                }
            });

            const result = await service.selectWorkspace('ws1', 'proj1');

            expect(result).toBe(true);
            // Should call project select to fix drift
            const projectSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('project select proj1')
            );
            expect(projectSelectCalls).toHaveLength(1);
        });

        it('should fail workspace selection if project context cannot be restored', async () => {
            const { service, mockCommandExecutor, mockCacheManager } = testMocks;

            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ project: { id: 'wrong-proj', name: 'Wrong Project' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('project select')) {
                    // Project selection fails
                    return { stdout: '', stderr: 'Project not found', code: 1, duration: 100 };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            const result = await service.selectWorkspace('ws1', 'proj1');

            expect(result).toBe(false);
            // Should NOT attempt workspace select since project selection failed
            const workspaceSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('workspace select')
            );
            expect(workspaceSelectCalls).toHaveLength(0);
        });
    });

    describe('selectProject() with context guard', () => {
        it('should check context and not re-select org when context matches', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            // Context already has correct org
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
            // Should NOT call org select since context matches
            const orgSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('org select')
            );
            expect(orgSelectCalls).toHaveLength(0);
        });

        it('should re-select org when context has drifted', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            // Context has different org (drift)
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ org: { id: 'wrong-org', name: 'Wrong Org' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('org select')) {
                    return { stdout: 'Organization selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('org list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'org1', name: 'Org 1', code: 'ORG1@AdobeOrg' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
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

            (parseJSON as jest.Mock).mockImplementation((str: string) => {
                try {
                    return JSON.parse(str);
                } catch {
                    return null;
                }
            });

            const result = await service.selectProject('proj1', 'org1');

            expect(result).toBe(true);
            // Should call org select to fix drift
            const orgSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('org select org1')
            );
            expect(orgSelectCalls).toHaveLength(1);
        });

        it('should fail project selection if org context cannot be restored', async () => {
            const { service, mockCommandExecutor, mockCacheManager } = testMocks;

            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    return {
                        stdout: JSON.stringify({ org: { id: 'wrong-org', name: 'Wrong Org' } }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('org select')) {
                    // Org selection fails
                    return { stdout: '', stderr: 'Organization not found', code: 1, duration: 100 };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            const result = await service.selectProject('proj1', 'org1');

            expect(result).toBe(false);
            // Should NOT attempt project select since org selection failed
            const projectSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('project select')
            );
            expect(projectSelectCalls).toHaveLength(0);
        });
    });

    describe('extractContextId()', () => {
        // Test through the public methods since extractContextId is private
        it('should handle string org in console.where response', async () => {
            const { service, mockCommandExecutor, mockCacheManager, mockOrgValidator } = testMocks;

            // Context with org as string (name)
            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockOrgValidator.testDeveloperPermissions.mockResolvedValue({
                hasPermissions: true,
                message: 'Has Developer role',
            });

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    // Org is returned as string (name) in some CLI versions
                    return {
                        stdout: JSON.stringify({ org: 'org1' }),
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

            // When org is string and matches, should not re-select
            const result = await service.selectProject('proj1', 'org1');

            expect(result).toBe(true);
            // Should NOT call org select since string value matches
            const orgSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('org select')
            );
            expect(orgSelectCalls).toHaveLength(0);
        });

        it('should handle string project in console.where response', async () => {
            const { service, mockCommandExecutor, mockCacheManager } = testMocks;

            mockCacheManager.getCachedConsoleWhere.mockReturnValue(undefined);

            mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
                if (cmd.includes('console where')) {
                    // Project is returned as string (name) in some CLI versions
                    return {
                        stdout: JSON.stringify({ project: 'proj1' }),
                        stderr: '',
                        code: 0,
                        duration: 50,
                    };
                }
                if (cmd.includes('workspace select')) {
                    return { stdout: 'Workspace selected', stderr: '', code: 0, duration: 100 };
                }
                if (cmd.includes('workspace list')) {
                    return {
                        stdout: JSON.stringify([{ id: 'ws1', name: 'Production' }]),
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 0, duration: 50 };
            });

            // When project is string and matches, should not re-select
            const result = await service.selectWorkspace('ws1', 'proj1');

            expect(result).toBe(true);
            // Should NOT call project select since string value matches
            const projectSelectCalls = mockCommandExecutor.execute.mock.calls.filter(
                ([cmd]) => typeof cmd === 'string' && cmd.includes('project select')
            );
            expect(projectSelectCalls).toHaveLength(0);
        });
    });
});
