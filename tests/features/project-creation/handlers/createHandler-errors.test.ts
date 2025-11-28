import { handleCreateProject } from '@/features/project-creation/handlers/createHandler';
import * as validation from '@/core/validation';
import * as executor from '@/features/project-creation/handlers/executor';
import * as promiseUtils from '@/core/utils/promiseUtils';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import {
    createMockContext,
    setupDefaultMocks,
    mockTimeout,
    mockExecutionFailure,
    setupMeshCleanupScenario,
    mockProjectDirectoryExists,
    mockConfig,
} from './createHandler.testUtils';

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

describe('Project Creation - Create Handler - Errors & Cleanup', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof setupDefaultMocks>;

    beforeEach(() => {
        mockCommandExecutor = setupDefaultMocks();
        mockContext = createMockContext();
    });

    describe('timeout handling', () => {
        it('should timeout after 30 minutes', async () => {
            mockTimeout();

            const result = await handleCreateProject(mockContext, mockConfig);

            expect(result.success).toBe(true); // Handler doesn't fail
            // Typed error system converts timeout to user-friendly message
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.any(String), // User-friendly message from TimeoutError
                    isTimeout: true,
                })
            );
        });

        it('should cleanup project directory on timeout', async () => {
            mockTimeout();
            mockProjectDirectoryExists(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                expect.stringContaining('test-project'),
                { recursive: true, force: true }
            );
        });

        it('should log timeout with elapsed time', async () => {
            mockTimeout();

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Failed after'),
                expect.any(Error)
            );
        });
    });

    describe('error handling', () => {
        it('should handle general creation failure', async () => {
            mockExecutionFailure('npm install failed');

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
            mockExecutionFailure('Component installation failed');
            mockProjectDirectoryExists(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaning up partial project')
            );
            expect(fsPromises.rm).toHaveBeenCalled();
        });

        it('should handle cleanup failure gracefully', async () => {
            mockExecutionFailure('Creation failed');
            mockProjectDirectoryExists(true);
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

        it('should set progress to "Failed" on error', async () => {
            mockExecutionFailure('General error');

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Failed',
                })
            );
        });

        it('should log error with elapsed time', async () => {
            mockExecutionFailure('Failed');

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/Failed after \d+m \d+s/),
                expect.any(Error)
            );
        });
    });

    describe('mesh cleanup on error', () => {
        it('should handle mesh cleanup failure gracefully', async () => {
            mockExecutionFailure('Creation failed');
            setupMeshCleanupScenario(mockContext, false);
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

        it('should successfully delete mesh with exit code 0', async () => {
            mockExecutionFailure('Failed');
            setupMeshCleanupScenario(mockContext, false);
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
            mockExecutionFailure('Failed');
            setupMeshCleanupScenario(mockContext, false);
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
    });

    describe('cleanup logic', () => {
        it('should not cleanup if project directory does not exist', async () => {
            mockExecutionFailure('Failed');
            mockProjectDirectoryExists(false);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).not.toHaveBeenCalled();
        });
    });
});
