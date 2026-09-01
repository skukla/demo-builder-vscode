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

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock validation
jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

// Mock BaseWebviewCommand (used by handleNavigateBack for panel transition)
jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn().mockReturnValue(null),
    },
}));

import * as vscode from 'vscode';
import { handleNavigateBack } from '@/features/dashboard/handlers/dashboardHandlers';

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

describe('handleNavigateBack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Creates a mock handler context for navigateBack handler tests
     */
    function createMockContext() {
        // The canonical HandlerContext, carrying only what this suite varies.
        // The literal it replaces named three members and reached the handler
        // through a cast at every call site.
        const stateManager = createMockStateManager({
                clearProject: jest.fn().mockResolvedValue(undefined),
            });
        const base = createMockHandlerContext({
            logger: createMockLogger(),
            stateManager,
            sendMessage: jest.fn(),
        });
        // `stateManager` is re-attached so its MOCK type survives: read back
        // through `HandlerContext` its members are plain functions, and this
        // suite calls `.mockImplementation` on them.
        return { ...base, stateManager };
    }

    describe('project clearing', () => {
        it('should clear current project from state', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context);

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
            await handleNavigateBack(context);

            // Then: clearProject runs first, then showProjectsList
            // (the logs toggle now lives in the always-present sidebar, so the
            //  dashboard-navigate-away panel reset was dropped)
            expect(callOrder).toEqual([
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
            await handleNavigateBack(context);

            // Then: showProjectsList command should be executed
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });

        it('should return success on successful navigation', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            const result = await handleNavigateBack(context);

            // Then: Should return success
            expect(result).toEqual({ success: true });
        });

        it('should log navigation event', async () => {
            // Given: A handler context
            const context = createMockContext();

            // When: navigateBack is called
            await handleNavigateBack(context);

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
            await handleNavigateBack(context);

            // Then: sendMessage should not be called
            expect(context.sendMessage).not.toHaveBeenCalled();
        });
    });
});
