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
    mockValidationError,
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

describe('Project Creation - Create Handler - Validation', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof setupDefaultMocks>;

    beforeEach(() => {
        mockCommandExecutor = setupDefaultMocks();
        mockContext = createMockContext();
    });

    describe('security validation', () => {
        it('should reject project name with path traversal', async () => {
            mockValidationError('Project name contains path separators');

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
            mockValidationError('Project name contains illegal characters');

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
            mockValidationError('Invalid name');

            await handleCreateProject(mockContext, {
                projectName: 'bad-name',
            });

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Invalid project name',
                expect.any(Error)
            );
        });
    });

    describe('duplicate project validation', () => {
        it('should reject project with duplicate name', async () => {
            // Mock getAllProjects to return existing project
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
                {
                    name: 'existing-project',
                    path: '/mock/home/.demo-builder/projects/existing-project',
                    lastModified: new Date(),
                },
            ]);

            const result = await handleCreateProject(mockContext, {
                projectName: 'existing-project',
            });

            expect(result.success).toBe(true); // Handler doesn't fail
            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: 'Project "existing-project" already exists. Please choose a different name or delete the existing project first.',
                })
            );
        });

        it('should allow project with unique name', async () => {
            // Mock getAllProjects to return different project
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
                {
                    name: 'other-project',
                    path: '/mock/home/.demo-builder/projects/other-project',
                    lastModified: new Date(),
                },
            ]);

            const result = await handleCreateProject(mockContext, {
                projectName: 'new-project',
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).toHaveBeenCalled();
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.stringContaining('already exists'),
                })
            );
        });

        it('should allow project when no existing projects', async () => {
            // Mock getAllProjects to return empty array
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([]);

            const result = await handleCreateProject(mockContext, {
                projectName: 'first-project',
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).toHaveBeenCalled();
        });

        it('should check case-sensitive duplicates correctly', async () => {
            // Mock getAllProjects with lowercase project
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
                {
                    name: 'my-project',
                    path: '/mock/home/.demo-builder/projects/my-project',
                    lastModified: new Date(),
                },
            ]);

            // Try to create with exact match (should fail)
            const result = await handleCreateProject(mockContext, {
                projectName: 'my-project',
            });

            expect(result.success).toBe(true);
            expect(executor.executeProjectCreation).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    error: expect.stringContaining('already exists'),
                })
            );
        });

        it('should log warning when duplicate detected', async () => {
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
                {
                    name: 'duplicate',
                    path: '/mock/home/.demo-builder/projects/duplicate',
                    lastModified: new Date(),
                },
            ]);

            await handleCreateProject(mockContext, {
                projectName: 'duplicate',
            });

            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Project "duplicate" already exists at:')
            );
        });

        it('should send progress message before error', async () => {
            (mockContext.stateManager.getAllProjects as jest.Mock).mockResolvedValue([
                {
                    name: 'existing',
                    path: '/mock/home/.demo-builder/projects/existing',
                    lastModified: new Date(),
                },
            ]);

            await handleCreateProject(mockContext, {
                projectName: 'existing',
            });

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationProgress',
                expect.objectContaining({
                    currentOperation: 'Failed',
                    progress: 0,
                    error: 'Project "existing" already exists',
                })
            );
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
            mockValidationError('Project name is required');

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

            await handleCreateProject(mockContext, {
                projectName: 'test-project',
            });

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

            await handleCreateProject(mockContext, {
                projectName: 'test-project',
            });

            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'creationFailed',
                expect.objectContaining({
                    elapsed: '0m 0s',
                })
            );
        });
    });
});
