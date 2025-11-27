/**
 * DeleteProjectCommand - Retry Logic Tests
 *
 * Tests for exponential backoff retry on ENOTEMPTY/EBUSY errors:
 * - Retry on ENOTEMPTY error (first attempt fails, retry succeeds)
 * - Exponential backoff timing (100ms, 200ms, 400ms, 800ms, 1600ms)
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

describe('DeleteProjectCommand - Retry Logic', () => {
    let command: DeleteProjectCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    const testProjectPath = '/tmp/test-project-retry';

    beforeEach(() => {
        jest.clearAllMocks();
        // Ensure we're using real timers for setup
        jest.useRealTimers();

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
        // Ensure timers are restored
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('Test 3: Retry on ENOTEMPTY error', () => {
        it('should retry when first attempt fails with ENOTEMPTY', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: File locked on first attempt, available on second
            let attemptCount = 0;
            mockRm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
                // Second attempt succeeds
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Should have retried
            expect(mockRm).toHaveBeenCalledTimes(2);

            // And: Should have succeeded after retry
            expect(mockStateManager.clearProject).toHaveBeenCalled();

            jest.useRealTimers();
        });

        it('should retry when first attempt fails with EBUSY', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: File busy on first attempt
            let attemptCount = 0;
            mockRm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('EBUSY: resource busy or locked');
                    throw error;
                }
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Should have retried and succeeded
            expect(mockRm).toHaveBeenCalledTimes(2);
            expect(mockStateManager.clearProject).toHaveBeenCalled();

            jest.useRealTimers();
        });

        it('should succeed after multiple retries', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: File locked for 3 attempts, then succeeds
            let attemptCount = 0;
            mockRm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 3) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
                // Fourth attempt succeeds
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Should have tried 4 times (3 failures + 1 success)
            expect(mockRm).toHaveBeenCalledTimes(4);
            expect(mockStateManager.clearProject).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Test: Exponential backoff timing', () => {
        it('should use exponential backoff delays (100, 200, 400, 800, 1600ms)', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: File locked for 4 attempts, then succeeds on 5th
            let attemptCount = 0;
            const attemptTimes: number[] = [];

            mockRm.mockImplementation(async () => {
                attemptTimes.push(Date.now());
                attemptCount++;
                if (attemptCount <= 4) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow all retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Should have made 5 attempts (4 failures + 1 success)
            expect(attemptCount).toBe(5);

            // Verify the time between attempts follows exponential backoff
            // First delay after first failure should be 100ms, then 200, 400, 800
            const delays: number[] = [];
            for (let i = 1; i < attemptTimes.length; i++) {
                delays.push(attemptTimes[i] - attemptTimes[i - 1]);
            }
            expect(delays).toEqual([100, 200, 400, 800]);

            jest.useRealTimers();
        });

        it('should log retry attempts with delay information', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: First attempt fails
            let attemptCount = 0;
            mockRm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Logger should have been called with waiting message
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Waiting for files')
            );

            jest.useRealTimers();
        });
    });

    describe('Verification after deletion', () => {
        it('should verify directory is deleted by checking ENOENT', async () => {
            // Ensure real timers for this test (no fake timer needed)
            jest.useRealTimers();

            // Given: fs.rm succeeds
            mockRm.mockResolvedValue(undefined);

            // And: fs.access throws ENOENT (directory gone)
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            await command.execute();

            // Then: Should verify deletion by calling fs.access
            expect(mockAccess).toHaveBeenCalledWith(testProjectPath);

            // And: Should have succeeded
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should retry if directory still exists after rm', async () => {
            // Use fake timers for this test
            jest.useFakeTimers();

            // Given: rm succeeds but access shows directory still exists
            let accessCount = 0;
            mockRm.mockResolvedValue(undefined);
            mockAccess.mockImplementation(async () => {
                accessCount++;
                if (accessCount === 1) {
                    // First check: directory still exists (access succeeds)
                    return undefined;
                }
                // Second check: directory gone
                throw { code: 'ENOENT' };
            });

            // When: Deletion attempted
            const executePromise = command.execute();

            // Advance timers to allow retries
            await jest.runAllTimersAsync();

            await executePromise;

            // Then: Should have retried
            expect(mockRm).toHaveBeenCalledTimes(2);

            jest.useRealTimers();
        });
    });
});
