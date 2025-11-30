/**
 * DeleteProjectCommand - Error Handling Tests
 *
 * Tests for error scenarios and state consistency:
 * - All retries exhausted (5 retries fail, clear error message)
 * - State remains consistent on failure
 * - Non-retryable errors fail immediately
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

describe('DeleteProjectCommand - Error Handling', () => {
    let command: DeleteProjectCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    const testProjectPath = '/tmp/test-project-error';

    // Store original setTimeout
    const originalSetTimeout = global.setTimeout;

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
            reset: jest.fn(),
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

        // Mock vscode.window.showErrorMessage
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('OK');

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
        global.setTimeout = originalSetTimeout;
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    describe('Test 4: All retries exhausted', () => {
        it('should fail gracefully after 5 retries', async () => {
            // Given: File locked persistently (all attempts fail)
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));
            mockAccess.mockResolvedValue(undefined); // Directory still exists

            // Mock setTimeout to execute immediately
            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted with 5 retries
            await command.execute();

            // Then: All 5 retries should be attempted
            expect(mockRm).toHaveBeenCalledTimes(5);

            // And: Error message should be shown to user
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to delete'),
                'OK'
            );
        });

        it('should not clear state if deletion fails', async () => {
            // Given: Deletion always fails
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: State should NOT be cleared (project remains in state)
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
            expect(mockStateManager.removeFromRecentProjects).not.toHaveBeenCalled();
        });

        it('should not clear status bar if deletion fails', async () => {
            // Given: Deletion always fails
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Status bar should NOT be cleared
            expect(mockStatusBar.clear).not.toHaveBeenCalled();
        });

        it('should log all retry attempts', async () => {
            // Given: Deletion always fails
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have logged retry attempts (4 retries after first failure)
            // First attempt fails, then 4 more retries = 4 debug logs with "Waiting for files to be released"
            const debugCalls = (mockLogger.debug as jest.Mock).mock.calls;
            const retryCalls = debugCalls.filter((call: any[]) =>
                call[0] && call[0].includes('Waiting for files to be released')
            );
            expect(retryCalls.length).toBe(4);
        });

        it('should show clear error message with attempt count', async () => {
            // Given: Deletion always fails
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Error message should be shown to user
            // Note: showError in BaseCommand shows generic message, detailed error goes to logger
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to delete project',
                'OK'
            );

            // And: Logger should have the detailed error with retry count
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to delete project files after all retries'),
                expect.any(Error)
            );
        });
    });

    describe('Non-retryable errors', () => {
        it('should fail immediately on permission denied error', async () => {
            // Given: Directory exists and permission denied error (not retryable)
            mockAccess.mockResolvedValue(undefined);
            mockRm.mockRejectedValue(new Error('EACCES: permission denied'));

            // Mock setTimeout to execute immediately (for any retry logic)
            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should NOT retry (only 1 attempt)
            expect(mockRm).toHaveBeenCalledTimes(1);

            // And: Error message should be shown
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('should fail immediately on unknown error', async () => {
            // Given: Directory exists and unknown error
            mockAccess.mockResolvedValue(undefined);
            mockRm.mockRejectedValue(new Error('Unknown filesystem error'));

            // Mock setTimeout to execute immediately (for any retry logic)
            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should NOT retry
            expect(mockRm).toHaveBeenCalledTimes(1);

            // And: State should remain consistent
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
        });
    });

    describe('State consistency on errors', () => {
        it('should not open welcome screen on failure', async () => {
            // Given: Deletion fails
            mockRm.mockRejectedValue(new Error('ENOTEMPTY: directory not empty'));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Welcome screen should NOT be opened
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
        });

        it('should log final failure with error details', async () => {
            // Given: Deletion fails persistently
            const errorMessage = 'ENOTEMPTY: directory not empty, some/path';
            mockRm.mockRejectedValue(new Error(errorMessage));

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Final error should be logged
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
