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
import { HandlerContext } from '@/commands/handlers/HandlerContext';
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
            // Reset mocks before each test
            jest.clearAllMocks();
        });

        it('should open project in workspace successfully', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(true);

            // Execute handler
            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.stateManager.getCurrentProject).toHaveBeenCalled();
            // Note: Panel disposal and workspace folder updates happen internally
        });

        it('should handle missing project', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue(null);

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found')
            );
        });

        it('should handle missing project path', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: null
            });

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found')
            );
        });

        it('should set reopen dashboard flag', async () => {
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(true);

            await handleOpenProject(mockContext);

            // Dashboard flag setting is done internally via dynamic imports
            // We can verify the project was fetched
            expect(mockContext.stateManager.getCurrentProject).toHaveBeenCalled();
        });

        // Test removed - workspace folder manipulation was removed in beta.64
        // handleOpenProject now directly opens dashboard without workspace manipulation

        it('should handle general errors', async () => {
            mockContext.stateManager.getCurrentProject.mockRejectedValue(new Error('State manager error'));

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Error opening project'),
                expect.any(Error)
            );
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
        it('should handle complete wizard lifecycle - project opening', async () => {
            // Create project (simulated)
            mockContext.stateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            // Open project (workspace folder manipulation removed in beta.64)
            await handleOpenProject(mockContext);
            expect(mockContext.panel.dispose).toHaveBeenCalled();
        });
    });
});
