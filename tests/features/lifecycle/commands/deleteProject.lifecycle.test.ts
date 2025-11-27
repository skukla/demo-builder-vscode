/**
 * DeleteProjectCommand - Lifecycle Tests
 *
 * Tests for dispose-before-delete pattern and project lifecycle management:
 * - Delete project with active watcher (watcher disposed first)
 * - Delete running project (stops demo first)
 * - State cleanup on success (project removed from state and recent list)
 */

import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock VS Code API with proper types
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(),
        setStatusBarMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    ProgressLocation: {
        Notification: 15,
    },
}));

// Mock fs/promises with explicit exports
jest.mock('fs/promises', () => ({
    rm: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue({ code: 'ENOENT' }),
}));
import * as fs from 'fs/promises';
const mockRm = fs.rm as jest.Mock;
const mockAccess = fs.access as jest.Mock;

// Mock logging
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
}));

// Import vscode after mock
import * as vscode from 'vscode';

describe('DeleteProjectCommand - Lifecycle', () => {
    let command: DeleteProjectCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    const testProjectPath = '/tmp/test-project-delete';

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset fs mocks
        mockRm.mockClear();
        mockAccess.mockClear();
        mockRm.mockResolvedValue(undefined);
        mockAccess.mockRejectedValue({ code: 'ENOENT' });

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/extension/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any;

        // Mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: testProjectPath,
                status: 'stopped',
            }),
            clearProject: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock status bar
        mockStatusBar = {
            clear: jest.fn(),
        } as any;

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        // Mock vscode.window.showInformationMessage for confirmation (returns 'Yes')
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

        // Mock vscode.window.withProgress to execute task immediately
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: any, task: any) => {
                return await task({ report: jest.fn() });
            }
        );

        // Mock vscode.commands.executeCommand
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        command = new DeleteProjectCommand(
            mockContext,
            mockStateManager,
            mockStatusBar,
            mockLogger
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('Test 1: Delete project with active watcher', () => {
        it('should wait for OS to release handles before deletion', async () => {
            // Given: Project exists at path
            // Project status is 'stopped' (default mock)

            // Track timing to verify 100ms wait
            const startTime = Date.now();
            let deleteTime = 0;

            mockRm.mockImplementation(async () => {
                deleteTime = Date.now();
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: User executes deleteProject command
            await command.execute();

            // Then: Should have waited ~100ms before deletion attempt
            const waitDuration = deleteTime - startTime;
            // Allow some tolerance for execution time
            expect(waitDuration).toBeGreaterThanOrEqual(90);
        });

        it('should delete directory after waiting for handle release', async () => {
            // Given: Project exists with stopped status
            // When: deleteProject command executes
            await command.execute();

            // Then: Directory should be deleted with recursive and force options
            expect(mockRm).toHaveBeenCalledWith(testProjectPath, { recursive: true, force: true });

            // And: State should be cleaned up
            expect(mockStateManager.clearProject).toHaveBeenCalled();
            expect(mockStateManager.removeFromRecentProjects).toHaveBeenCalledWith(testProjectPath);
        });

        it('should update status bar after successful deletion', async () => {
            // Given: Project exists
            // When: deleteProject command executes
            await command.execute();

            // Then: Status bar should be cleared
            expect(mockStatusBar.clear).toHaveBeenCalled();
        });
    });

    describe('Test 2: Delete running project (stops demo first)', () => {
        it('should stop demo before deleting if project is running', async () => {
            // Given: Project with status 'running'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: testProjectPath,
                status: 'running',
            } as any);

            // When: deleteProject command executes
            await command.execute();

            // Then: stopDemo command should be called first
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');

            // And: Deletion should happen after stopDemo
            expect(mockRm).toHaveBeenCalledWith(testProjectPath, { recursive: true, force: true });
        });

        it('should not call stopDemo if project is already stopped', async () => {
            // Given: Project with status 'stopped'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: testProjectPath,
                status: 'stopped',
            } as any);

            // When: deleteProject command executes
            await command.execute();

            // Then: stopDemo should NOT be called
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.stopDemo');

            // But showWelcome should still be called at the end
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showWelcome');
        });
    });

    describe('Test 5: State cleanup on success', () => {
        it('should remove project from recent projects list', async () => {
            // Given: Project exists in state and recent projects list
            // When: Deletion succeeds
            await command.execute();

            // Then: Project should be removed from recent projects
            expect(mockStateManager.removeFromRecentProjects).toHaveBeenCalledWith(testProjectPath);
        });

        it('should clear current project state', async () => {
            // Given: Project exists in state
            // When: Deletion succeeds
            await command.execute();

            // Then: Current project should be cleared
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should clear status bar', async () => {
            // Given: Project exists
            // When: Deletion succeeds
            await command.execute();

            // Then: Status bar should be cleared
            expect(mockStatusBar.clear).toHaveBeenCalled();
        });

        it('should open Welcome screen after successful deletion', async () => {
            // Given: Project exists
            // When: Deletion succeeds
            await command.execute();

            // Then: Welcome screen should be opened
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showWelcome');
        });
    });

    describe('Edge cases', () => {
        it('should not delete if user cancels confirmation', async () => {
            // Given: User cancels confirmation dialog
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

            // When: deleteProject command executes
            await command.execute();

            // Then: No deletion should occur
            expect(mockRm).not.toHaveBeenCalled();
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
        });

        it('should handle missing project gracefully', async () => {
            // Given: No project loaded
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // When: deleteProject command executes
            await command.execute();

            // Then: Should show warning and not attempt deletion
            expect(mockRm).not.toHaveBeenCalled();
        });
    });
});
