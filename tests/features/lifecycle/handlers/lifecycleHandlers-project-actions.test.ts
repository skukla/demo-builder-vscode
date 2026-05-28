/**
 * Lifecycle Handlers Tests - Project Actions
 *
 * Tests for project-related actions:
 * - handleOpenProject: Returns to projects list after wizard completion
 * - handleBrowseFiles: Opens project in file explorer
 */

import {
    handleOpenProject,
    handleBrowseFiles
} from '@/features/lifecycle/handlers/lifecycleHandlers';
import { createMockContext } from './lifecycleHandlers.testUtils';

// Mock vscode
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, path })),
        parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock ShowProjectsListCommand
jest.mock('@/features/projects-dashboard/commands/showProjectsList', () => ({
    ShowProjectsListCommand: {
        disposeActivePanel: jest.fn(),
    },
}));

// Mock validation (handleBrowseFiles calls validateProjectPath)
jest.mock('@/core/validation/PathSafetyValidator', () => ({
    validateProjectPath: jest.fn(),
    validatePathSafety: jest.fn(),
    assertPathInsideSync: jest.fn((p: string) => p),
    assertPathInside: jest.fn(async (p: string) => p),
}));

describe('lifecycleHandlers - Project Actions', () => {
    describe('handleOpenProject', () => {
        it('should dispose the wizard panel to return to projects list', async () => {
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context as any);

            expect(context.panel?.dispose).toHaveBeenCalled();
        });

        it('should set dashboard reopen flag file', async () => {
            const fsPromises = require('fs/promises');
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context as any);

            expect(fsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.open-dashboard-after-restart'),
                expect.any(String),
                'utf8',
            );
        });

        it('should close existing Projects List webview', async () => {
            const { ShowProjectsListCommand } = require('@/features/projects-dashboard/commands/showProjectsList');
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context as any);

            expect(ShowProjectsListCommand.disposeActivePanel).toHaveBeenCalled();
        });

        it('should log error when project is missing', async () => {
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleOpenProject(context as any);

            expect(result).toEqual({ success: true });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should log error when project path is missing', async () => {
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: undefined,
            });

            const result = await handleOpenProject(context as any);

            expect(result).toEqual({ success: true });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should return success', async () => {
            const context = createMockContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            const result = await handleOpenProject(context as any);

            expect(result).toEqual({ success: true });
        });
    });

    describe('handleBrowseFiles', () => {
        it('should open project in Explorer successfully', async () => {
            const vscode = require('vscode');
            const context = createMockContext();

            const result = await handleBrowseFiles(context as any, {
                projectPath: '/home/user/.demo-builder/projects/test-project',
            });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.explorer');
            expect(result.success).toBe(true);
        });

        it('should reject invalid project path', async () => {
            const { validateProjectPath } = require('@/core/validation/PathSafetyValidator');
            (validateProjectPath as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Access denied');
            });
            const context = createMockContext();

            const result = await handleBrowseFiles(context as any, {
                projectPath: '/etc/passwd',
            });

            expect(result.success).toBe(false);
        });
    });
});
