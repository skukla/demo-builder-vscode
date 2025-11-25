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

// Mock fs/promises
jest.mock('fs/promises');

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
    let mockFs: any;
    const testProjectPath = '/tmp/test-project-retry';

    // Store original setTimeout
    const originalSetTimeout = global.setTimeout;
    let capturedDelays: number[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
        capturedDelays = [];

        // Set up fs mocks using require pattern
        mockFs = require('fs/promises');
        mockFs.rm = jest.fn().mockResolvedValue(undefined);
        mockFs.access = jest.fn().mockRejectedValue({ code: 'ENOENT' });

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
        // Restore original setTimeout
        global.setTimeout = originalSetTimeout;
        jest.restoreAllMocks();
    });

    describe('Test 3: Retry on ENOTEMPTY error', () => {
        it('should retry when first attempt fails with ENOTEMPTY', async () => {
            // Given: File locked on first attempt, available on second
            let attemptCount = 0;
            mockFs.rm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
                // Second attempt succeeds
            });
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            // Mock setTimeout to capture delays but execute immediately
            global.setTimeout = jest.fn((fn: () => void, delay?: number) => {
                if (delay && delay > 50) { // Ignore small delays from other sources
                    capturedDelays.push(delay);
                }
                return originalSetTimeout(fn, 0); // Execute immediately for test speed
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have retried
            expect(mockFs.rm).toHaveBeenCalledTimes(2);

            // And: Should have succeeded after retry
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should retry when first attempt fails with EBUSY', async () => {
            // Given: File busy on first attempt
            let attemptCount = 0;
            mockFs.rm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('EBUSY: resource busy or locked');
                    throw error;
                }
            });
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            // Mock setTimeout
            global.setTimeout = jest.fn((fn: () => void, delay?: number) => {
                if (delay && delay > 50) {
                    capturedDelays.push(delay);
                }
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have retried and succeeded
            expect(mockFs.rm).toHaveBeenCalledTimes(2);
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should succeed after multiple retries', async () => {
            // Given: File locked for 3 attempts, then succeeds
            let attemptCount = 0;
            mockFs.rm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 3) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
                // Fourth attempt succeeds
            });
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            // Mock setTimeout
            global.setTimeout = jest.fn((fn: () => void, delay?: number) => {
                if (delay && delay > 50) {
                    capturedDelays.push(delay);
                }
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have tried 4 times (3 failures + 1 success)
            expect(mockFs.rm).toHaveBeenCalledTimes(4);
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });
    });

    describe('Test: Exponential backoff timing', () => {
        it('should use exponential backoff delays (100, 200, 400, 800, 1600ms)', async () => {
            // Given: File locked for 4 attempts, then succeeds on 5th
            let attemptCount = 0;
            let startCapturing = false; // Skip initial 100ms wait for handle release

            mockFs.rm.mockImplementation(async () => {
                startCapturing = true; // Start capturing after first rm call
                attemptCount++;
                if (attemptCount <= 4) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
            });
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            // Mock setTimeout to capture retry delays only (100-1600ms range for exponential backoff)
            // Skip: initial 100ms wait (before rm is called) and 2000ms from showSuccessMessage
            global.setTimeout = jest.fn((fn: () => void, delay?: number) => {
                if (startCapturing && delay && delay >= 100 && delay <= 1600) {
                    capturedDelays.push(delay);
                }
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have captured exponential backoff delays for 4 retries
            // Attempts: 100ms (1st retry), 200ms (2nd retry), 400ms (3rd retry), 800ms (4th retry)
            expect(capturedDelays).toEqual([100, 200, 400, 800]);
        });

        it('should log retry attempts with delay information', async () => {
            // Given: First attempt fails
            let attemptCount = 0;
            mockFs.rm.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('ENOTEMPTY: directory not empty');
                    throw error;
                }
            });
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Logger should have been called with retry information
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('retrying')
            );
        });
    });

    describe('Verification after deletion', () => {
        it('should verify directory is deleted by checking ENOENT', async () => {
            // Given: fs.rm succeeds
            mockFs.rm.mockResolvedValue(undefined);

            // And: fs.access throws ENOENT (directory gone)
            mockFs.access.mockRejectedValue({ code: 'ENOENT' });

            // When: Deletion attempted
            await command.execute();

            // Then: Should verify deletion by calling fs.access
            expect(mockFs.access).toHaveBeenCalledWith(testProjectPath);

            // And: Should have succeeded
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should retry if directory still exists after rm', async () => {
            // Given: rm succeeds but access shows directory still exists
            let accessCount = 0;
            mockFs.rm.mockResolvedValue(undefined);
            mockFs.access.mockImplementation(async () => {
                accessCount++;
                if (accessCount === 1) {
                    // First check: directory still exists (access succeeds)
                    return undefined;
                }
                // Second check: directory gone
                throw { code: 'ENOENT' };
            });

            global.setTimeout = jest.fn((fn: () => void) => {
                return originalSetTimeout(fn, 0);
            }) as any;

            // When: Deletion attempted
            await command.execute();

            // Then: Should have retried
            expect(mockFs.rm).toHaveBeenCalledTimes(2);
        });
    });
});
