/**
 * Tests for the openIntegrations handler
 *
 * The dashboard's integrations summary tile opens the dedicated integrations
 * surface. Mirrors handleNavigateBack's shape: dispose the sibling panel under a
 * webview transition, then dispatch the command.
 *
 * Strict TDD: written BEFORE the handler exists.
 */

// Mock vscode - must be before imports due to hoisting
jest.mock(
    'vscode',
    () => ({
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
    }),
    { virtual: true }
);

jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));

jest.mock('@/core/base', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn().mockReturnValue(null),
    },
}));

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { handleOpenIntegrations } from '@/features/dashboard/handlers/dashboardHandlers';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockTransition = BaseWebviewCommand as unknown as {
    startWebviewTransition: jest.Mock;
    endWebviewTransition: jest.Mock;
    getActivePanel: jest.Mock;
};

function createMockContext() {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
        sendMessage: jest.fn(),
    };
}

describe('handleOpenIntegrations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // clearAllMocks only clears CALLS, not implementations — reset the
        // command mock so a rejection set by one test can't leak into the next.
        mockExecuteCommand.mockReset();
        mockTransition.getActivePanel.mockReturnValue(null);
    });

    it('dispatches the integrations surface command', async () => {
        const context = createMockContext();

        const result = await handleOpenIntegrations(context as never);

        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showIntegrations');
        expect(result).toEqual({ success: true });
    });

    it('disposes the dashboard panel before dispatching (tab replacement)', async () => {
        const context = createMockContext();
        const dispose = jest.fn();
        mockTransition.getActivePanel.mockReturnValue({ dispose });
        const order: string[] = [];
        dispose.mockImplementation(() => order.push('dispose'));
        mockExecuteCommand.mockImplementation(async (cmd: string) => {
            order.push(`command:${cmd}`);
        });

        await handleOpenIntegrations(context as never);

        expect(order).toEqual(['dispose', 'command:demoBuilder.showIntegrations']);
    });

    it('wraps the swap in a webview transition so disposal side-effects are suppressed', async () => {
        const context = createMockContext();

        await handleOpenIntegrations(context as never);

        expect(mockTransition.startWebviewTransition).toHaveBeenCalled();
        expect(mockTransition.endWebviewTransition).toHaveBeenCalled();
    });

    it('ends the transition even when the command throws', async () => {
        const context = createMockContext();
        mockExecuteCommand.mockRejectedValue(new Error('boom'));

        const result = await handleOpenIntegrations(context as never);

        expect(mockTransition.endWebviewTransition).toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('tolerates an already-disposed dashboard panel', async () => {
        const context = createMockContext();
        mockTransition.getActivePanel.mockReturnValue({
            dispose: jest.fn(() => {
                throw new Error('already disposed');
            }),
        });

        const result = await handleOpenIntegrations(context as never);

        expect(result).toEqual({ success: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showIntegrations');
    });
});
