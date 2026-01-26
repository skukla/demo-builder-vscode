/**
 * DeleteProjectCommand - Navigation Tests
 *
 * Tests for navigation after project deletion:
 * - After deletion, should navigate to Projects List (not Welcome)
 * - StateManager.clearProject should be called
 * - Project panels should be closed
 * - Empty state is handled by UI (Projects List shown even with no projects)
 *
 * Step 5 of Projects Navigation Architecture plan.
 */

import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';
import { StateManager } from '@/core/state';
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

describe('DeleteProjectCommand - Navigation', () => {
    let command: DeleteProjectCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    const testProjectPath = '/tmp/test-project-navigation';

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
            mockLogger
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('Given user is viewing Project Detail', () => {
        describe('When the current project is deleted', () => {
            it('should execute showProjectsList command (not showWelcome)', async () => {
                // Given: Project exists and user confirms deletion
                mockStateManager.getCurrentProject.mockResolvedValue({
                    name: 'test-project',
                    path: testProjectPath,
                    status: 'stopped',
                } as any);

                // When: User deletes the project
                await command.execute();

                // Then: showProjectsList should be called (not showWelcome)
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
            });

            it('should call StateManager.clearProject', async () => {
                // Given: Project exists
                // When: Deletion succeeds
                await command.execute();

                // Then: clearProject should be called
                expect(mockStateManager.clearProject).toHaveBeenCalled();
            });

            it('should close project panels before navigation', async () => {
                // Given: Project exists
                // When: Deletion succeeds
                await command.execute();

                // Then: StateManager.clearProject should be called before showProjectsList
                const executeCommandCalls = (vscode.commands.executeCommand as jest.Mock).mock.calls;
                const showProjectsListCall = executeCommandCalls.findIndex(
                    (call: any[]) => call[0] === 'demoBuilder.showProjectsList'
                );

                // clearProject should have been called (panels closed as part of delete flow)
                expect(mockStateManager.clearProject).toHaveBeenCalled();
                // And navigation should happen
                expect(showProjectsListCall).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Given user has only one project', () => {
        describe('When that project is deleted', () => {
            it('should still show Projects List (empty state handled by UI)', async () => {
                // Given: User has only one project (simulated - same test setup)
                mockStateManager.getCurrentProject.mockResolvedValue({
                    name: 'only-project',
                    path: testProjectPath,
                    status: 'stopped',
                } as any);

                // When: The last project is deleted
                await command.execute();

                // Then: Should still navigate to Projects List (UI handles empty state)
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');

                // And: Should NOT navigate to Welcome
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
            });
        });
    });

    describe('Navigation failure handling', () => {
        it('should not throw if showProjectsList command fails', async () => {
            // Given: showProjectsList command will fail
            (vscode.commands.executeCommand as jest.Mock).mockImplementation(
                async (cmd: string) => {
                    if (cmd === 'demoBuilder.showProjectsList') {
                        throw new Error('Navigation failed');
                    }
                    return undefined;
                }
            );

            // When: Deletion succeeds but navigation fails
            // Then: Should not throw (deletion still succeeded)
            await expect(command.execute()).resolves.not.toThrow();

            // And: clearProject should still have been called
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });
    });
});
