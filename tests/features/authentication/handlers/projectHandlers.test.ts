/**
 * Project Handlers Tests
 *
 * Tests for Adobe project management:
 * - handleEnsureOrgSelected: Verify organization is selected
 * - handleGetProjects: Fetch projects for current organization
 * - handleSelectProject: Select a specific project
 * - handleCheckProjectApis: Verify API Mesh access
 */

import {
    handleEnsureOrgSelected,
    handleGetProjects,
    handleSelectProject,
    handleCheckProjectApis
} from '@/features/authentication/handlers/projectHandlers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di/serviceLocator';
import * as securityValidation from '@/core/validation/securityValidation';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/securityValidation');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str))
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        PROJECT_LIST: 30000,
        WORKSPACE_LIST: 30000
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('projectHandlers', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockAuthManager: any;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock authentication manager
        mockAuthManager = {
            getCurrentOrganization: jest.fn(),
            getCurrentProject: jest.fn(),
            getProjects: jest.fn(),
            selectProject: jest.fn()
        };

        // Mock command executor
        mockCommandExecutor = {
            executeAdobeCLI: jest.fn()
        };

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Create mock context
        mockContext = {
            authManager: mockAuthManager,
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn()
            } as any,
            debugLogger: {
                debug: jest.fn()
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sharedState: {
                isAuthenticating: false
            }
        } as any;
    });

    describe('handleEnsureOrgSelected', () => {
        it('should return success when organization is selected', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('orgSelectionStatus', {
                hasOrg: true
            });
        });

        it('should return false hasOrg when no organization selected', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue(null);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('orgSelectionStatus', {
                hasOrg: false
            });
        });

        it('should handle errors gracefully', async () => {
            const error = new Error('Failed to get org');
            mockAuthManager.getCurrentOrganization.mockRejectedValue(error);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to ensure org selected:',
                error
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to check organization selection',
                details: 'Failed to get org'
            });
        });

        it('should handle undefined org gracefully', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue(undefined);

            const result = await handleEnsureOrgSelected(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasOrg).toBe(false);
        });
    });

    describe('handleGetProjects', () => {
        const mockProjects = [
            { id: 'proj-1', name: 'Project 1', title: 'Project 1' },
            { id: 'proj-2', name: 'Project 2', title: 'Project 2' }
        ];

        it('should fetch projects successfully', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockProjects);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', mockProjects);
        });

        it('should show loading status before fetching', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockResolvedValue(mockProjects);

            await handleGetProjects(mockContext);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('project-loading-status', {
                isLoading: true,
                message: 'Loading your Adobe projects...',
                subMessage: 'Fetching from organization: Test Org'
            });
        });

        it('should handle empty project list', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockResolvedValue([]);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
        });

        it('should handle timeout error', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', {
                error: expect.stringContaining('timed out')
            });
        });

        it('should handle generic error', async () => {
            const error = new Error('Network error');
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockRejectedValue(error);

            const result = await handleGetProjects(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to load projects. Please try again.');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to get projects:',
                error
            );
        });

        it('should handle payload with orgId', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockResolvedValue(mockProjects);

            const result = await handleGetProjects(mockContext, { orgId: 'org-123' });

            expect(result.success).toBe(true);
            expect(mockAuthManager.getProjects).toHaveBeenCalled();
        });
    });

    describe('handleSelectProject', () => {
        beforeEach(() => {
            (securityValidation.validateProjectId as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
        });

        it('should select project successfully', async () => {
            const projectId = 'proj-123';
            mockAuthManager.selectProject.mockResolvedValue(true);

            const result = await handleSelectProject(mockContext, { projectId });

            expect(result.success).toBe(true);
            expect(mockAuthManager.selectProject).toHaveBeenCalledWith(projectId);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('projectSelected', { projectId });
            expect(mockContext.logger.info).toHaveBeenCalledWith(`Selected project: ${projectId}`);
        });

        it('should validate project ID before selection', async () => {
            const projectId = 'proj-123';
            mockAuthManager.selectProject.mockResolvedValue(true);

            await handleSelectProject(mockContext, { projectId });

            expect(securityValidation.validateProjectId).toHaveBeenCalledWith(projectId);
        });

        it('should reject invalid project ID', async () => {
            const projectId = '../../../etc/passwd';
            const validationError = new Error('Invalid project ID');
            (securityValidation.validateProjectId as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'Invalid project ID'
            );

            expect(mockAuthManager.selectProject).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project] Invalid project ID',
                validationError
            );
        });

        it('should handle selection failure', async () => {
            const projectId = 'proj-123';
            mockAuthManager.selectProject.mockResolvedValue(false);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                `Failed to select project ${projectId}`
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                `Failed to select project ${projectId}`
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select project',
                details: expect.stringContaining('unsuccessful')
            });
        });

        it('should handle authManager error', async () => {
            const projectId = 'proj-123';
            const error = new Error('Network timeout');
            mockAuthManager.selectProject.mockRejectedValue(error);

            await expect(handleSelectProject(mockContext, { projectId })).rejects.toThrow(
                'Network timeout'
            );

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to select project:',
                error
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('error', {
                message: 'Failed to select project',
                details: 'Network timeout'
            });
        });

        it('should log debug messages during selection', async () => {
            const projectId = 'proj-123';
            mockAuthManager.selectProject.mockResolvedValue(true);

            await handleSelectProject(mockContext, { projectId });

            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                `[Project] handleSelectProject called with projectId: ${projectId}`
            );
            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                '[Project] About to call authManager.selectProject'
            );
        });
    });

    describe('handleCheckProjectApis', () => {
        it('should detect API Mesh when enabled', async () => {
            // Mock CLI commands
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --active --json
                    stdout: JSON.stringify({ meshId: 'mesh-123' })
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh access confirmed')
            );
        });

        it('should detect when API Mesh is not enabled', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: 403 Forbidden',
                    stderr: 'not authorized',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh not enabled')
            );
        });

        it('should handle when plugin is not installed', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValueOnce({
                // aio plugins --json
                stdout: JSON.stringify([
                    { name: '@adobe/aio-cli-plugin-something-else' }
                ])
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh CLI plugin not installed')
            );
        });

        it('should handle no active mesh but API enabled', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: No active mesh found',
                    stderr: 'not found',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh enabled; no active mesh found')
            );
        });

        it('should try fallback commands on error', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json fails
                    message: 'Unknown command',
                    stderr: '',
                    stdout: ''
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --help succeeds
                    stdout: 'Usage: aio api-mesh:get'
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
        });

        it('should return false when all probes fail', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] Unable to confirm API Mesh access')
            );
        });

        it('should handle plugin list parsing errors', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValueOnce({
                // aio plugins --json with invalid JSON
                stdout: 'invalid json'
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
        });

        it('should handle general errors', async () => {
            const error = new Error('CLI command failed');
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

            // Implementation catches errors and returns success with hasMesh: false
            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                '[Adobe Setup] Failed to verify plugins; continuing',
                expect.objectContaining({ error: expect.any(String) })
            );
        });
    });

    describe('Error Message Formatting', () => {
        it('should format timeout errors correctly', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetProjects(mockContext);

            expect(result.error).toContain('timed out');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', {
                error: expect.stringContaining('timed out')
            });
        });

        it('should provide generic error message for non-timeout errors', async () => {
            mockAuthManager.getCurrentOrganization.mockResolvedValue({
                id: 'org-123',
                name: 'Test Org'
            });
            mockAuthManager.getProjects.mockRejectedValue(new Error('Some other error'));

            const result = await handleGetProjects(mockContext);

            expect(result.error).toBe('Failed to load projects. Please try again.');
        });
    });
});
