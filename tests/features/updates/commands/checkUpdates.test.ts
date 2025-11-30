/**
 * Unit Tests for CheckUpdatesCommand
 *
 * Tests the check updates command with focus on message visibility delay.
 * Step 2: Add Message Visibility Delay
 *
 * Coverage areas:
 * - Progress message display
 * - 1500ms delay before GitHub API call (ensures user sees "Checking for updates..." message)
 * - Message content verification
 * - Timing verification
 * - Error handling
 *
 * Total tests: 7
 */

import * as vscode from 'vscode';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/core/logging';
import type { StateManager } from '@/core/state';
import type { StatusBarManager } from '@/core/vscode/StatusBarManager';

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        withProgress: jest.fn(),
        showInformationMessage: jest.fn(),
    },
    ProgressLocation: {
        Notification: 15,
    },
}));

// Mock UpdateManager
jest.mock('@/features/updates/services/updateManager');

// Mock ComponentUpdater and ExtensionUpdater
jest.mock('@/features/updates/services/componentUpdater');
jest.mock('@/features/updates/services/extensionUpdater');

describe('CheckUpdatesCommand - Message Visibility Delay (Step 2)', () => {
    let command: CheckUpdatesCommand;
    let mockContext: any;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockProgress: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Create mock context
        mockContext = {
            subscriptions: [],
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        };

        // Create mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Create mock status bar manager
        mockStatusBar = {
            show: jest.fn(),
            hide: jest.fn(),
            updateStatus: jest.fn(),
        } as any;

        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        // Create mock progress reporter
        mockProgress = {
            report: jest.fn(),
        };

        // Setup vscode.window.withProgress to execute the callback
        (vscode.window.withProgress as jest.Mock).mockImplementation((_options, callback) => {
            return callback(mockProgress);
        });

        // Create command instance
        command = new CheckUpdatesCommand(mockContext, mockStateManager, mockStatusBar, mockLogger);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Happy Path', () => {
        it('should show "Checking for updates..." progress message', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            mockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
                hasUpdate: false,
                current: '1.0.0',
                latest: '1.0.0',
            });
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();

            // Flush microtasks to allow promise chain to start
            await Promise.resolve();

            // Assert - progress.report should be called immediately
            expect(mockProgress.report).toHaveBeenCalledWith({
                message: 'Checking for updates...',
            });

            // Complete the test
            await jest.runAllTimersAsync();
            await executePromise;
        });

        it('should wait 2000ms after showing message before making GitHub API call', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            const checkExtensionUpdateSpy = jest.fn().mockResolvedValue({
                hasUpdate: false,
                current: '1.0.0',
                latest: '1.0.0',
            });
            mockUpdateManager.prototype.checkExtensionUpdate = checkExtensionUpdateSpy;
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();
            await Promise.resolve(); // Flush microtasks

            // Assert: Progress message shown
            expect(mockProgress.report).toHaveBeenCalled();

            // Assert: API should NOT be called yet (delay is 2000ms)
            expect(checkExtensionUpdateSpy).not.toHaveBeenCalled();

            // Advance by 1999ms - should still not be called
            await jest.advanceTimersByTimeAsync(1999);
            expect(checkExtensionUpdateSpy).not.toHaveBeenCalled();

            // Advance by 1ms more (total 2000ms) - now should be called
            await jest.advanceTimersByTimeAsync(1);
            expect(checkExtensionUpdateSpy).toHaveBeenCalled();

            // Complete test
            await jest.runAllTimersAsync();
            await executePromise;
        });

        it('should show progress result after update check completes', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            mockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
                hasUpdate: false,
                current: '1.0.0',
                latest: '1.0.0',
            });
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();
            await Promise.resolve();

            // Fast-forward through all timers
            await jest.runAllTimersAsync();

            // Assert: Should show "up to date" message
            expect(mockProgress.report).toHaveBeenCalledWith({
                message: 'Up to date (v1.0.0)',
            });

            await executePromise;
        });
    });

    describe('Timing Verification', () => {
        it('should ensure at least 1500ms passes between progress.report() and API call', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            let progressReportCalled = false;
            let apiCallAfter1500ms = false;

            mockProgress.report = jest.fn(() => {
                progressReportCalled = true;
            });

            const checkExtensionUpdateSpy = jest.fn(() => {
                // Check if 1500ms has passed since we started
                // We verify this by checking if progressReportCalled is true
                // AND we've advanced timers by 1500ms
                apiCallAfter1500ms = progressReportCalled;
                return Promise.resolve({
                    hasUpdate: false,
                    current: '1.0.0',
                    latest: '1.0.0',
                });
            });

            mockUpdateManager.prototype.checkExtensionUpdate = checkExtensionUpdateSpy;
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();
            await Promise.resolve();

            // Assert: Progress reported immediately
            expect(progressReportCalled).toBe(true);

            // Assert: API should NOT be called yet
            expect(checkExtensionUpdateSpy).not.toHaveBeenCalled();

            // Advance by 1500ms
            await jest.advanceTimersByTimeAsync(TIMEOUTS.UPDATE_MESSAGE_DELAY);

            // Assert: Now API should be called
            expect(checkExtensionUpdateSpy).toHaveBeenCalled();
            expect(apiCallAfter1500ms).toBe(true);

            await jest.runAllTimersAsync();
            await executePromise;
        });

        it('should ensure total duration is at least 1500ms even if API responds in <100ms', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            const startTime = Date.now();

            // Fast API response (<100ms)
            mockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
                hasUpdate: false,
                current: '1.0.0',
                latest: '1.0.0',
            });
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();
            await Promise.resolve();

            // Fast-forward all timers
            await jest.runAllTimersAsync();
            await executePromise;

            const endTime = Date.now();
            const totalDuration = endTime - startTime;

            // Assert - should have at least 1500ms delay
            expect(totalDuration).toBeGreaterThanOrEqual(TIMEOUTS.UPDATE_MESSAGE_DELAY);
        });
    });

    describe('Message Content', () => {
        it('should display correct message text "Checking for updates..."', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            mockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
                hasUpdate: false,
                current: '1.0.0',
                latest: '1.0.0',
            });
            mockUpdateManager.prototype.checkComponentUpdates = jest.fn().mockResolvedValue(new Map());

            // Act
            const executePromise = command.execute();
            await Promise.resolve();

            // Assert
            expect(mockProgress.report).toHaveBeenCalledWith({
                message: 'Checking for updates...',
            });

            // Complete test
            await jest.runAllTimersAsync();
            await executePromise;
        });
    });

    describe('Error Conditions', () => {
        it('should handle GitHub API failure gracefully after delay', async () => {
            // Arrange
            const mockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            const apiError = new Error('GitHub API failed');
            mockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockRejectedValue(apiError);

            // Spy on command's showError method
            const showErrorSpy = jest.spyOn(command as any, 'showError').mockResolvedValue(undefined);

            // Act
            const executePromise = command.execute();
            await Promise.resolve();

            // Assert: Progress message shown before error
            expect(mockProgress.report).toHaveBeenCalledWith({
                message: 'Checking for updates...',
            });

            // Advance timers to trigger API call and error
            await jest.runAllTimersAsync();
            await executePromise;

            // Assert: Error handled
            expect(showErrorSpy).toHaveBeenCalledWith('Failed to check for updates', apiError);
        });
    });
});
