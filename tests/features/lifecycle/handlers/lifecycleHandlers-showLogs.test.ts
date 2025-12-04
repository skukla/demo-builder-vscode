/**
 * Lifecycle Handlers Tests - Show Logs
 *
 * Tests for the handleShowLogs handler:
 * - Toggles the VS Code output panel with Demo Builder logs
 * - First click opens, second click closes
 */

import { handleShowLogs, resetLogsViewState } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { createMockContext } from './lifecycleHandlers.testUtils';

// Mock vscode inline to avoid hoisting issues
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });

// Import the mocked vscode module
import * as vscode from 'vscode';
const mockVSCode = vscode as jest.Mocked<typeof vscode>;

describe('lifecycleHandlers - Show Logs', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        // Reset the toggle state for each test
        resetLogsViewState();
    });

    describe('handleShowLogs', () => {
        it('should execute demoBuilder.showLogs command on first call', async () => {
            // Given: A valid handler context (logs panel is hidden)
            // When: handleShowLogs is called
            const result = await handleShowLogs(mockContext);

            // Then: The showLogs command should be executed
            expect(result.success).toBe(true);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });

        it('should toggle - close panel on second call', async () => {
            // Given: Logs panel was opened by first call
            await handleShowLogs(mockContext);
            jest.clearAllMocks();

            // When: handleShowLogs is called again
            const result = await handleShowLogs(mockContext);

            // Then: The closePanel command should be executed
            expect(result.success).toBe(true);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.closePanel');
        });

        it('should toggle - open panel on third call', async () => {
            // Given: Logs panel was opened then closed
            await handleShowLogs(mockContext); // open
            await handleShowLogs(mockContext); // close
            jest.clearAllMocks();

            // When: handleShowLogs is called again
            const result = await handleShowLogs(mockContext);

            // Then: The showLogs command should be executed again
            expect(result.success).toBe(true);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });

        it('should log the action', async () => {
            // Given: A valid handler context
            // When: handleShowLogs is called
            await handleShowLogs(mockContext);

            // Then: The action should be logged
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Logs]')
            );
        });

        it('should return success even if command execution fails', async () => {
            // Given: The showLogs command throws an error
            (mockVSCode.commands.executeCommand as jest.Mock).mockRejectedValue(
                new Error('Command failed')
            );

            // When: handleShowLogs is called
            const result = await handleShowLogs(mockContext);

            // Then: Should still return success (non-critical action)
            expect(result.success).toBe(true);
        });
    });
});
