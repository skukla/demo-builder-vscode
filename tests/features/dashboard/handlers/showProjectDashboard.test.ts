/**
 * Tests for the showProjectDashboard handler
 *
 * The integrations surface's "Project Dashboard" button returns to the project
 * dashboard. The mirror image of handleOpenIntegrations: dispose the sibling
 * panel inside a webview transition, then dispatch the command.
 *
 * NOT navigateBack — that clears the current project and lands on the projects
 * LIST. This keeps the project and swaps back to its dashboard.
 *
 * Strict TDD: written BEFORE the handler exists.
 */

jest.mock(
    'vscode',
    () => ({
        commands: { executeCommand: jest.fn() },
        window: { activeColorTheme: { kind: 1 } },
        ColorThemeKind: { Dark: 2, Light: 1 },
        env: { openExternal: jest.fn() },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
    }),
    { virtual: true }
);

jest.mock('@/features/mesh/services/stalenessDetector');

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));

jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn().mockReturnValue(null),
    },
}));

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { handleShowProjectDashboard } from '@/features/dashboard/handlers/dashboardHandlers';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockTransition = BaseWebviewCommand as unknown as {
    startWebviewTransition: jest.Mock;
    endWebviewTransition: jest.Mock;
    getActivePanel: jest.Mock;
};

function createMockContext() {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
        stateManager: { clearProject: jest.fn() },
        sendMessage: jest.fn(),
    };
}

describe('handleShowProjectDashboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecuteCommand.mockReset();
        mockTransition.getActivePanel.mockReturnValue(null);
    });

    it('dispatches the project dashboard command', async () => {
        const context = createMockContext();

        const result = await handleShowProjectDashboard(context as never);

        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
        expect(result).toEqual({ success: true });
    });

    it('disposes the integrations panel before dispatching (tab replacement)', async () => {
        const context = createMockContext();
        const dispose = jest.fn();
        mockTransition.getActivePanel.mockReturnValue({ dispose });
        const order: string[] = [];
        dispose.mockImplementation(() => order.push('dispose'));
        mockExecuteCommand.mockImplementation(async (cmd: string) => {
            order.push(`command:${cmd}`);
        });

        await handleShowProjectDashboard(context as never);

        expect(mockTransition.getActivePanel).toHaveBeenCalledWith('demoBuilder.integrations');
        expect(order).toEqual(['dispose', 'command:demoBuilder.showProjectDashboard']);
    });

    it('wraps the swap in a webview transition', async () => {
        const context = createMockContext();

        await handleShowProjectDashboard(context as never);

        expect(mockTransition.startWebviewTransition).toHaveBeenCalled();
        expect(mockTransition.endWebviewTransition).toHaveBeenCalled();
    });

    it('does NOT clear the current project (that is navigateBack, not this)', async () => {
        const context = createMockContext();

        await handleShowProjectDashboard(context as never);

        expect(context.stateManager.clearProject).not.toHaveBeenCalled();
    });

    it('ends the transition even when the command throws', async () => {
        const context = createMockContext();
        mockExecuteCommand.mockRejectedValue(new Error('boom'));

        const result = await handleShowProjectDashboard(context as never);

        expect(mockTransition.endWebviewTransition).toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('tolerates an already-disposed integrations panel', async () => {
        const context = createMockContext();
        mockTransition.getActivePanel.mockReturnValue({
            dispose: jest.fn(() => {
                throw new Error('already disposed');
            }),
        });

        const result = await handleShowProjectDashboard(context as never);

        expect(result).toEqual({ success: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard');
    });
});
