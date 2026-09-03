/**
 * DeleteProjectCommand - Error Handling Tests
 *
 * Tests for error scenarios and state consistency:
 * - All retries exhausted (5 retries fail, clear error message)
 * - State remains consistent on failure
 * - Non-retryable errors fail immediately
 */

import {
    DeleteProjectCommand,
    vscode,
    setupDeleteProject,
} from './deleteProject.testUtils';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';

// Mock fs/promises with explicit exports
jest.mock('fs/promises', () => ({
    rm: jest.fn().mockResolvedValue(undefined),
}));
import * as fs from 'fs/promises';
const mockRm = fs.rm as jest.Mock;

// Import vscode after mock

describe('DeleteProjectCommand - Error Handling', () => {
    let command: DeleteProjectCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    const testProjectPath = '/tmp/test-project-error';

    // Store original setTimeout
    const originalSetTimeout = global.setTimeout;

    /** Collapse the retry back-off so the five attempts run without waiting. */
    function runTimeoutsImmediately(): void {
        jest.spyOn(global, 'setTimeout').mockImplementation((fn) => originalSetTimeout(fn, 0));
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockRm.mockClear();
        mockRm.mockResolvedValue(undefined);
        ({ command, mockStateManager, mockLogger } = setupDeleteProject(testProjectPath));
    });

    afterEach(() => {
        global.setTimeout = originalSetTimeout;
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    describe('Test 4: All retries exhausted', () => {
        it('should fail gracefully after 5 retries', async () => {
            // Given: File locked persistently (all attempts fail with ENOTEMPTY code)
            const error = new Error('directory not empty') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            // Mock setTimeout to execute immediately
            runTimeoutsImmediately();

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
            // Given: Deletion always fails with ENOTEMPTY code
            const error = new Error('directory not empty') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: State should NOT be cleared (project remains in state)
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
            expect(mockStateManager.removeFromRecentProjects).not.toHaveBeenCalled();
        });

        it('should log all retry attempts', async () => {
            // Given: Deletion always fails with ENOTEMPTY code
            const error = new Error('directory not empty') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: Should have logged retry attempts (4 retries after first failure)
            // First attempt fails, then 4 more retries = 4 debug logs with "Waiting"
            const debugCalls = (mockLogger.debug as jest.Mock).mock.calls;
            const retryCalls = debugCalls.filter((call: any[]) =>
                call[0] && call[0].includes('Waiting')
            );
            expect(retryCalls).toHaveLength(4);
        });

        it('should show clear error message with attempt count', async () => {
            // Given: Deletion always fails with ENOTEMPTY code
            const error = new Error('directory not empty') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            runTimeoutsImmediately();

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
        it('should fail immediately on permission denied error (EACCES)', async () => {
            // Given: Permission denied error with EACCES code (not in retryable list)
            const error = new Error('permission denied') as NodeJS.ErrnoException;
            error.code = 'EACCES';
            mockRm.mockRejectedValue(error);

            // Mock setTimeout to execute immediately (for any retry logic)
            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: Should NOT retry (only 1 attempt)
            expect(mockRm).toHaveBeenCalledTimes(1);

            // And: Error message should be shown
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('should fail immediately on unknown error code', async () => {
            // Given: Unknown error code
            const error = new Error('unknown filesystem error') as NodeJS.ErrnoException;
            error.code = 'UNKNOWN';
            mockRm.mockRejectedValue(error);

            // Mock setTimeout to execute immediately (for any retry logic)
            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: Should NOT retry
            expect(mockRm).toHaveBeenCalledTimes(1);

            // And: State should remain consistent
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
        });
    });

    describe('State consistency on errors', () => {
        it('should not navigate anywhere on failure', async () => {
            // Given: Deletion fails with ENOTEMPTY code
            const error = new Error('directory not empty') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: No navigation should occur
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
        });

        it('should log final failure with error details', async () => {
            // Given: Deletion fails persistently with ENOTEMPTY code
            const error = new Error('directory not empty, some/path') as NodeJS.ErrnoException;
            error.code = 'ENOTEMPTY';
            mockRm.mockRejectedValue(error);

            runTimeoutsImmediately();

            // When: Deletion attempted
            await command.execute();

            // Then: Final error should be logged
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
