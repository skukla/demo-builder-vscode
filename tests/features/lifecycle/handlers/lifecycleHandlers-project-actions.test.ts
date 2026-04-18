/**
 * Lifecycle Handlers Tests - Project Actions
 *
 * Tests for project-related actions:
 * - handleOpenProject: Opens created project in workspace
 * - handleBrowseFiles: Opens project in file explorer
 */

import {
    handleOpenProject,
    handleBrowseFiles
} from '@/features/lifecycle/handlers/lifecycleHandlers';
import { HandlerContext as _HandlerContext } from '@/commands/handlers/HandlerContext';
import * as securityValidation from '@/core/validation';
import { createMockContext } from './lifecycleHandlers.testUtils';

// Mock vscode inline to avoid hoisting issues
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, path })),
        parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    workspace: {
        updateWorkspaceFolders: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    },
    env: {
        openExternal: jest.fn()
    }
}), { virtual: true });
jest.mock('@/core/validation');

// Import the mocked vscode module
import * as vscode from 'vscode';
const mockVSCode = vscode as any;

describe('lifecycleHandlers - Project Actions', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleOpenProject', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockVSCode.commands.executeCommand.mockResolvedValue(undefined);
        });

        it('should call vscode.openFolder with the project path', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project',
            });

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockVSCode.Uri.file).toHaveBeenCalledWith('/path/to/project');
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: '/path/to/project' }),
                { forceNewWindow: false },
            );
        });

        it('should throw when project is missing', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue(null);

            await expect(handleOpenProject(mockContext)).rejects.toThrow('Project not found');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found'),
            );
        });

        it('should throw when project path is missing', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: null,
            });

            await expect(handleOpenProject(mockContext)).rejects.toThrow('Project not found');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found'),
            );
        });

        it('should log the project path being opened', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project',
            });

            await handleOpenProject(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('/path/to/project'),
            );
        });

        it('should not dispose panels or set flag files', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project',
            });

            await handleOpenProject(mockContext);

            // No panel disposal - vscode.openFolder triggers extension host restart
            expect(mockContext.panel.dispose).not.toHaveBeenCalled();
        });
    });

    describe('handleBrowseFiles', () => {
        beforeEach(() => {
            (securityValidation.validateProjectPath as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
        });

        it('should open project in Explorer successfully', async () => {
            const projectPath = '/path/to/project';
            mockVSCode.commands.executeCommand.mockResolvedValue(undefined);

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(true);
            expect(securityValidation.validateProjectPath).toHaveBeenCalledWith(projectPath);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.explorer');
            // Verify revealInExplorer was called (2nd call)
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledTimes(2);
            const calls = mockVSCode.commands.executeCommand.mock.calls;
            expect(calls[1][0]).toBe('revealInExplorer');
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[Project Creation] Opened project in Explorer'
            );
        });

        it('should reject invalid project path', async () => {
            const projectPath = '../../../etc/passwd';
            const validationError = new Error('Invalid path');
            (securityValidation.validateProjectPath as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Access denied');
            expect(mockVSCode.commands.executeCommand).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Invalid project path',
                validationError
            );
        });

        it('should handle empty project path', async () => {
            const result = await handleBrowseFiles(mockContext, { projectPath: '' });

            // Empty path should not open anything
            expect(result.success).toBe(true);
        });

        it('should handle command execution error', async () => {
            const projectPath = '/path/to/project';
            mockVSCode.commands.executeCommand.mockRejectedValue(new Error('Command failed'));

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to open file browser');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Failed to open Explorer',
                expect.any(Error)
            );
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete wizard lifecycle - project opening via vscode.openFolder', async () => {
            mockVSCode.commands.executeCommand.mockResolvedValue(undefined);
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project',
            });

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.any(Object),
                { forceNewWindow: false },
            );
        });
    });
});
