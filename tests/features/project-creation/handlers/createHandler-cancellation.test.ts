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
    mockCancellation,
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

describe('Project Creation - Create Handler - Cancellation', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof setupDefaultMocks>;

    beforeEach(() => {
        mockCommandExecutor = setupDefaultMocks();
        mockContext = createMockContext();
    });

    describe('user cancellation', () => {
        it('should handle user cancellation', async () => {
            mockCancellation();

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
            mockCancellation();
            mockProjectDirectoryExists(true);

            await handleCreateProject(mockContext, mockConfig);

            expect(fsPromises.rm).toHaveBeenCalledWith(
                expect.stringContaining('test-project'),
                { recursive: true, force: true }
            );
        });

        it('should set progress to "Cancelled" on cancellation', async () => {
            mockCancellation();

            await handleCreateProject(mockContext, mockConfig);

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Cancelled',
                })
            );
        });
    });

    describe('mesh cleanup on cancellation', () => {
        it('should delete orphaned mesh created in this session', async () => {
            mockCancellation();
            setupMeshCleanupScenario(mockContext, false); // Mesh did NOT exist before

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:delete --autoConfirmAction',
                expect.any(Object)
            );
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Cleaning up orphaned API Mesh')
            );
        });

        it('should preserve pre-existing mesh on cancellation', async () => {
            mockCancellation();
            setupMeshCleanupScenario(mockContext, true); // Mesh DID exist before

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('api-mesh:delete'),
                expect.any(Object)
            );
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Mesh existed before session - preserving it')
            );
        });
    });

    describe('state cleanup', () => {
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

        it('should not delete mesh if not created in this session', async () => {
            (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
                new Error('Failed')
            );
            mockContext.sharedState.meshCreatedForWorkspace = undefined;

            await handleCreateProject(mockContext, mockConfig);

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });
});
