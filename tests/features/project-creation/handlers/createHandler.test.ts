import { handleCreateProject } from '@/features/project-creation/handlers/createHandler';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import * as validation from '@/core/validation';
import * as executor from '@/features/project-creation/handlers/executor';
import * as promiseUtils from '@/core/utils/promiseUtils';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

// Mock all dependencies
jest.mock('@/core/validation');
jest.mock('@/features/project-creation/handlers/executor');
jest.mock('@/core/utils/promiseUtils');
jest.mock('@/core/di');
jest.mock('vscode');
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        rm: jest.fn(),
    },
}));

describe('Project Creation - Create Handler', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockCommandExecutor: any;

    const mockConfig = {
        projectName: 'test-project',
        components: {
            frontend: 'react-app',
            backend: 'nodejs',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock CommandExecutor
        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'success', stderr: '' }),
        };
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Mock validation
        (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {});

        // Mock executor
        (executor.executeProjectCreation as jest.Mock).mockResolvedValue(undefined);

        // Mock promiseUtils.withTimeout to just execute the promise
        (promiseUtils.withTimeout as jest.Mock).mockImplementation(async (promise) => promise);

        // Mock vscode
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.workspace as any) = { isTrusted: true };

        // Mock fs
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Create mock context
        mockContext = createMockContext();
    });

    function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
        return {
            sendMessage: jest.fn().mockResolvedValue(undefined),
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            } as any,
            context: {
                globalState: {
                    get: jest.fn().mockReturnValue(false),
                    update: jest.fn().mockResolvedValue(undefined),
                },
            } as any,
            sharedState: {
                projectCreationAbortController: undefined,
                meshCreatedForWorkspace: undefined,
                meshExistedBeforeSession: undefined,
            },
            ...overrides,
        } as any;
    }

    describe('happy path', () => {
        it('should create project successfully', async () => {
            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(validation.validateProjectNameSecurity).toHaveBeenCalledWith('test-project');
            expect(executor.executeProjectCreation).toHaveBeenCalledWith(mockContext, mockConfig);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Initializing',
                    progress: 0,
                })
            );
        });

        it('should create AbortController for cancellation support', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sharedState.projectCreationAbortController).toBeUndefined(); // Cleaned up in finally
        });

        it('should show workspace trust tip on first run', async () => {
            (vscode.workspace as any).isTrusted = false;
            (mockContext.context.globalState.get as jest.Mock).mockReturnValue(false);

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.context.globalState.get).toHaveBeenCalledWith(
                'demoBuilder.trustTipShown',
                false
            );
            expect(mockContext.context.globalState.update).toHaveBeenCalledWith(
                'demoBuilder.trustTipShown',
                true
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Trust all Demo Builder projects'),
                'Learn How',
                'Skip for Now'
            );
        });

        it('should not show workspace trust tip if already shown', async () => {
            (vscode.workspace as any).isTrusted = false;
            (mockContext.context.globalState.get as jest.Mock).mockReturnValue(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should not show workspace trust tip if workspace already trusted', async () => {
            (vscode.workspace as any).isTrusted = true;

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should show detailed instructions if user clicks "Learn How"', async () => {
            (vscode.workspace as any).isTrusted = false;
            (mockContext.context.globalState.get as jest.Mock).mockReturnValue(false);
            (vscode.window.showInformationMessage as jest.Mock)
                .mockResolvedValueOnce('Learn How')
                .mockResolvedValueOnce(undefined);

            await handleCreateProject(mockContext, mockConfig);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
            expect(vscode.window.showInformationMessage).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('Add'),
                'Got it!'
            );
        });

        it('should handle user clicking "Skip for Now"', async () => {
            (vscode.workspace as any).isTrusted = false;
            (mockContext.context.globalState.get as jest.Mock).mockReturnValue(false);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Skip for Now');

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).toHaveBeenCalled();
        });
    });

    describe('security validation', () => {
        it('should reject project name with path traversal', async () => {
            (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {
                throw new Error('Project name contains path separators');
            });

            const result = await handleCreateProject(mockContext, {
                projectName: '../etc/passwd',
            });

            expect(result.success).toBe(true); // Handler doesn't fail
            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: 'Invalid project name: Project name contains path separators',
                })
            );
        });

        it('should reject project name with shell injection', async () => {
            (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {
                throw new Error('Project name contains illegal characters');
            });

            const result = await handleCreateProject(mockContext, {
                projectName: 'test; rm -rf /',
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.stringContaining('Invalid project name'),
                })
            );
        });

        it('should reject non-string project name', async () => {
            await expect(
                handleCreateProject(mockContext, {
                    projectName: 123 as any,
                })
            ).rejects.toThrow('projectName must be a string');

            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
        });

        it('should log validation errors', async () => {
            (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid name');
            });

            await handleCreateProject(mockContext, {
                projectName: 'bad-name',
            });

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Invalid project name',
                expect.any(Error)
            );
        });
    });

    describe('timeout handling', () => {
        it('should timeout after 30 minutes', async () => {
            (promiseUtils.withTimeout as jest.Mock).mockRejectedValue(
                new Error('Project creation timed out after 30 minutes')
            );

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true); // Handler doesn't fail
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.stringContaining('timed out'),
                    isTimeout: true,
                })
            );
        });

        it('should cleanup project directory on timeout', async () => {
            (promiseUtils.withTimeout as jest.Mock).mockRejectedValue(
                new Error('Project creation timed out')
            );
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                expect.stringContaining('test-project'),
                { recursive: true, force: true }
            );
        });

        it('should log timeout with elapsed time', async () => {
            (promiseUtils.withTimeout as jest.Mock).mockRejectedValue(
                new Error('Project creation timed out')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Failed after'),
                expect.any(Error)
            );
        });
    });

    describe('cancellation handling', () => {
        it('should handle user cancellation', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Operation cancelled by user')
            );

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationCancelled',
                expect.objectContaining({
                    message: 'Project creation was cancelled',
                })
            );
        });

        it('should cleanup project directory on cancellation', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Operation cancelled by user')
            );
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                expect.stringContaining('test-project'),
                { recursive: true, force: true }
            );
        });

        it('should delete orphaned mesh created in this session', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Operation cancelled by user')
            );
            mockContext.sharedState.meshCreatedForWorkspace = 'workspace-123';
            mockContext.sharedState.meshExistedBeforeSession = undefined; // Mesh did NOT exist before

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:delete --autoConfirmAction',
                expect.any(Object)
            );
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaning up orphaned API Mesh')
            );
        });

        it('should preserve pre-existing mesh on cancellation', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Operation cancelled by user')
            );
            mockContext.sharedState.meshCreatedForWorkspace = 'workspace-123';
            mockContext.sharedState.meshExistedBeforeSession = 'workspace-123'; // Mesh DID exist before

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('api-mesh:delete'),
                expect.any(Object)
            );
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Mesh existed before session - preserving it')
            );
        });

        it('should set progress to "Cancelled" on cancellation', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Operation cancelled by user')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Cancelled',
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle general creation failure', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('npm install failed')
            );

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true); // Handler doesn't fail
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: 'npm install failed',
                    isTimeout: false,
                })
            );
        });

        it('should cleanup project directory on failure', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Component installation failed')
            );
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaning up partial project')
            );
            expect(fsPromises.rm).toHaveBeenCalled();
        });

        it('should handle cleanup failure gracefully', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Creation failed')
            );
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fsPromises.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to cleanup partial project'),
                expect.any(Error)
            );
            // Original error should still be reported
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: 'Creation failed',
                })
            );
        });

        it('should handle mesh cleanup failure gracefully', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Creation failed')
            );
            mockContext.sharedState.meshCreatedForWorkspace = 'workspace-123';
            mockContext.sharedState.meshExistedBeforeSession = undefined;
            (mockCommandExecutor.execute as jest.Mock).mockRejectedValue(
                new Error('Mesh delete failed')
            );

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error during mesh cleanup'),
                expect.any(Error)
            );
        });

        it('should set progress to "Failed" on error', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('General error')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Failed',
                })
            );
        });

        it('should log error with elapsed time', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/Failed after \d+m \d+s/),
                expect.any(Error)
            );
        });
    });

    describe('cleanup logic', () => {
        it('should not cleanup if project directory does not exist', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).not.toHaveBeenCalled();
        });

        it('should cleanup sharedState in finally block', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sharedState.projectCreationAbortController).toBeUndefined();
            expect(mockContext.sharedState.meshCreatedForWorkspace).toBeUndefined();
            expect(mockContext.sharedState.meshExistedBeforeSession).toBeUndefined();
        });

        it('should cleanup sharedState even on error', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sharedState.projectCreationAbortController).toBeUndefined();
            expect(mockContext.sharedState.meshCreatedForWorkspace).toBeUndefined();
        });

        it('should successfully delete mesh with exit code 0', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );
            mockContext.sharedState.meshCreatedForWorkspace = 'workspace-123';
            mockContext.sharedState.meshExistedBeforeSession = undefined;
            (mockCommandExecutor.execute as jest.Mock).mockResolvedValue({
                code: 0,
                stdout: 'Deleted',
                stderr: '',
            });

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                '[Project Creation] Successfully deleted orphaned mesh'
            );
        });

        it('should handle mesh delete with non-zero exit code', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );
            mockContext.sharedState.meshCreatedForWorkspace = 'workspace-123';
            mockContext.sharedState.meshExistedBeforeSession = undefined;
            (mockCommandExecutor.execute as jest.Mock).mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Mesh not found',
            });

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to delete orphaned mesh'),

            );
        });

        it('should not delete mesh if not created in this session', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );
            mockContext.sharedState.meshCreatedForWorkspace = undefined;

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle missing projectName', async () => {
            await expect(
                handleCreateProject(mockContext, {})
            ).rejects.toThrow('projectName must be a string');
        });

        it('should handle null projectName', async () => {
            await expect(
                handleCreateProject(mockContext, { projectName: null })
            ).rejects.toThrow('projectName must be a string');
        });

        it('should handle empty projectName', async () => {
            (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {
                throw new Error('Project name is required');
            });

            const result = await handleCreateProject(mockContext, {
                projectName: '',
            });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.stringContaining('Project name is required'),
                })
            );
        });

        it('should pass AbortController signal to withTimeout', async () => {
            await handleCreateProject(mockContext, mockConfig);

            expect(promiseUtils.withTimeout).toHaveBeenCalledWith(
                expect.any(Promise),
                expect.objectContaining({
                    signal: expect.any(AbortSignal),
                })
            );
        });

        it('should format elapsed time correctly', async () => {
            (executor.executeProjectCreation as jest.Mock).mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, 65000))
            );
            (promiseUtils.withTimeout as jest.Mock).mockImplementation(
                async (promise) => promise
            );
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    elapsed: expect.stringMatching(/\d+m \d+s/),
                })
            );
        });

        it('should handle very fast failures (< 1 second)', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Immediate failure')
            );

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    elapsed: '0m 0s',
                })
            );
        });
    });
});
