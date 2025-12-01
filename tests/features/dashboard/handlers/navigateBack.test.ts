/**
 * Tests for navigateBack handler
 *
 * Tests that navigateBack clears the current project and navigates to projects list.
 */

// Mock vscode - must be before imports due to hoisting
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
}), { virtual: true });

import * as vscode from 'vscode';
import { handleNavigateBack } from '@/features/dashboard/handlers/dashboardHandlers';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

describe('handleNavigateBack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Creates a mock handler context for navigateBack handler tests
     */
    function createMockContext() {
        return {
            stateManager: {
                clearProject: jest.fn().mockResolvedValue(undefined),
            },
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            },
            sendMessage: jest.fn(),
        };
    }

    describe('project clearing', () => {
        it('should clear current project from state', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context as any);

            // Then: clearProject should be called
            expect(context.stateManager.clearProject).toHaveBeenCalled();
        });

        it('should clear project before navigating to projects list', async () => {
            // Given: A handler context
            const context = createMockContext();
            const callOrder: string[] = [];

            context.stateManager.clearProject.mockImplementation(async () => {
                callOrder.push('clearProject');
            });
            mockExecuteCommand.mockImplementation(async (cmd: string) => {
                callOrder.push(`command:${cmd}`);
            });

            // When: navigateBack is called
            await handleNavigateBack(context as any);

            // Then: clearProject should be called before showProjectsList
            expect(callOrder).toEqual([
                'clearProject',
                'command:demoBuilder.showProjectsList',
            ]);
        });
    });

    describe('navigation', () => {
        it('should execute demoBuilder.showProjectsList command', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context as any);

            // Then: showProjectsList command should be executed
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });

        it('should return success on successful navigation', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            const result = await handleNavigateBack(context as any);

            // Then: Should return success
            expect(result).toEqual({ success: true });
        });

        it('should handle clearProject failure gracefully', async () => {
            // Given: clearProject fails
            const context = createMockContext();
            context.stateManager.clearProject.mockRejectedValue(new Error('Clear failed'));

            // When: navigateBack is called
            const result = await handleNavigateBack(context as any);

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to navigate back');
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should handle showProjectsList command failure gracefully', async () => {
            // Given: Command execution fails
            const context = createMockContext();
            mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

            // When: navigateBack is called
            const result = await handleNavigateBack(context as any);

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to navigate back');
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should log navigation event', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context as any);

            // Then: Should log the navigation
            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Navigating back to projects list')
            );
        });
    });

    describe('Pattern B compliance', () => {
        it('should NOT use sendMessage (Pattern B)', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context as any);

            // Then: sendMessage should not be called
            expect(context.sendMessage).not.toHaveBeenCalled();
        });
    });
});
