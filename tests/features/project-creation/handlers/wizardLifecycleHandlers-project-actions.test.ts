/**
 * Lifecycle Handlers Tests - Project Actions
 *
 * Tests for project-related actions:
 * - handleOpenProject: Returns to projects list after wizard completion
 * - handleBrowseFiles: Opens project in file explorer
 */

import * as vscode from 'vscode';
import { handleOpenProject } from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import { createWizardLifecycleContext } from './wizardLifecycleHandlers.testUtils';


// Mock fs/promises
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock BaseWebviewCommand (the handler disposes the projects list via viewType)
jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: {
        disposePanel: jest.fn(),
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
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleOpenProject', () => {
        it('should dispose the wizard panel to return to projects list', async () => {
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context);

            expect(context.panel?.dispose).toHaveBeenCalled();
        });

        it('should set dashboard reopen flag file', async () => {
            const fsPromises = require('fs/promises');
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context);

            expect(fsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.open-dashboard-after-restart'),
                expect.any(String),
                'utf8'
            );
        });

        it('creates the .demo-builder directory recursively before writing the flag', async () => {
            // `recursive: true` is what makes this work on a machine that has never
            // run the extension; without it mkdir throws ENOENT on a missing parent.
            const fsPromises = require('fs/promises');
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context);

            expect(fsPromises.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('.demo-builder'),
                { recursive: true }
            );
        });

        it('writes the project identity the dashboard needs to reopen', async () => {
            const fsPromises = require('fs/promises');
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context);

            const [, payload] = (fsPromises.writeFile as jest.Mock).mock.calls[0];
            expect(JSON.parse(payload)).toEqual({
                projectName: 'test-project',
                projectPath: '/home/user/.demo-builder/projects/test-project',
                timestamp: expect.any(Number),
            });
        });

        it('completes without surfacing an error when there is no wizard panel', async () => {
            // openProject also runs from surfaces that hold no panel reference; the
            // optional call is what keeps that from falling into the error path.
            const context = createWizardLifecycleContext();
            context.panel = undefined;
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            const result = await handleOpenProject(context);

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
            expect(result).toEqual({ success: true });
        });

        it('tells the user when returning to the projects list fails', async () => {
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            await handleOpenProject(context);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to return to projects list.'
            );
        });

        it('still returns to the projects list when the reopen flag cannot be written', async () => {
            // The flag is a convenience; a read-only home directory must not stop the
            // wizard from closing.
            const fsPromises = require('fs/promises');
            (fsPromises.mkdir as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            const result = await handleOpenProject(context);

            expect(context.panel?.dispose).toHaveBeenCalled();
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
            expect(result).toEqual({ success: true });
        });

        it('should close existing Projects List webview', async () => {
            const { BaseWebviewCommand } = require('@/core/base/baseWebviewCommand');
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            await handleOpenProject(context);

            expect(BaseWebviewCommand.disposePanel).toHaveBeenCalledWith(
                'demoBuilder.projectsList'
            );
        });

        it('should log error when project is missing', async () => {
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleOpenProject(context);

            expect(result).toEqual({ success: true });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should log error when project path is missing', async () => {
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: undefined,
            });

            const result = await handleOpenProject(context);

            expect(result).toEqual({ success: true });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should return success', async () => {
            const context = createWizardLifecycleContext();
            context.stateManager.getCurrentProject = jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/home/user/.demo-builder/projects/test-project',
            });

            const result = await handleOpenProject(context);

            expect(result).toEqual({ success: true });
        });
    });
});
