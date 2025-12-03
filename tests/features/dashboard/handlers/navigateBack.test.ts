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
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock stalenessDetector
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication
jest.mock('@/features/authentication');

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock validation
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));

// Mock BaseWebviewCommand (used by handleNavigateBack for panel transition)
jest.mock('@/core/base', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn().mockReturnValue(null),
    },
}));

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

            // Then: resetToggleStates (setContext) should run first,
            // then clearProject, then showProjectsList
            expect(callOrder).toEqual([
                'command:setContext',           // resetToggleStates() hides components
                'clearProject',                 // Clear current project
                'command:demoBuilder.showProjectsList', // Navigate to projects list
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
