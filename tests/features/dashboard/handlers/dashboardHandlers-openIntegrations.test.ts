/**
 * Tests for the openIntegrations handler
 *
 * The dashboard's integrations summary tile opens the dedicated integrations
 * surface. Mirrors handleNavigateBack's shape: dispose the sibling panel under a
 * webview transition, then dispatch the command.
 *
 * Strict TDD: written BEFORE the handler exists.
 */


jest.mock('@/core/state/projectStateSync');

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Org targeting is ambient; the only way to observe it is the wrapper.
const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
    buildOrgTargetFromProjectAdobe: (adobe?: { organization?: string }) => ({
        orgId: adobe?.organization ?? '',
    }),
}));

jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn().mockReturnValue(null),
    },
}));

import './dashboardValidatorMocks';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { handleOpenIntegrations } from '@/features/dashboard/handlers/dashboardHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { poolUnits } from '../../../helpers/authenticationServiceFake';
const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockTransition = BaseWebviewCommand as unknown as {
    startWebviewTransition: jest.Mock;
    endWebviewTransition: jest.Mock;
    getActivePanel: jest.Mock;
};

const mockGetTokenStatus = jest.fn().mockResolvedValue({ isAuthenticated: true });
const mockGetServicesForOrg = jest.fn().mockResolvedValue([]);

function createMockContext(project: Project = PROJECT) {
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(poolUnits({
        getTokenStatus: mockGetTokenStatus,
        getServicesForOrg: mockGetServicesForOrg,
    }));
    // The canonical HandlerContext, with the three members this suite varies. The
    // literal it replaces named those three and reached the handler through
    // `as never` at ten call sites — so the handler was free to read anything.
    return createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage: jest.fn(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
}

const PROJECT = createMockProject({
    name: 'demo',
    path: '/p',
    adobe: { organization: 'org-A', projectId: 'p1', workspace: 'w1' },
});

/** The prefetch is fire-and-forget, so let its promise chain settle. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('handleOpenIntegrations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // clearAllMocks only clears CALLS, not implementations — reset the
        // command mock so a rejection set by one test can't leak into the next.
        mockExecuteCommand.mockReset();
        mockTransition.getActivePanel.mockReturnValue(null);
        mockGetTokenStatus.mockResolvedValue({ isAuthenticated: true });
        mockGetServicesForOrg.mockReset().mockResolvedValue([]);
    });

    // The slow reads (the API list, the Commerce sign-in) start in the command this dispatches,
    // which the projects list's Integrations also runs: started here, that door got neither
    // (2026-10-18). The command's suite checks they start; this one that the tile adds no second.
    it('leaves the slow reads to the screen it opens', async () => {
        const context = createMockContext();

        await handleOpenIntegrations(context);
        await settle();

        expect(mockGetServicesForOrg).not.toHaveBeenCalled();
    });

    it('dispatches the integrations surface command', async () => {
        const context = createMockContext();

        const result = await handleOpenIntegrations(context);

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

        await handleOpenIntegrations(context);

        expect(order).toEqual(['dispose', 'command:demoBuilder.showIntegrations']);
    });

    it('wraps the swap in a webview transition so disposal side-effects are suppressed', async () => {
        const context = createMockContext();

        await handleOpenIntegrations(context);

        expect(mockTransition.startWebviewTransition).toHaveBeenCalled();
        expect(mockTransition.endWebviewTransition).toHaveBeenCalled();
    });

    it('ends the transition even when the command throws', async () => {
        const context = createMockContext();
        mockExecuteCommand.mockRejectedValue(new Error('boom'));

        const result = await handleOpenIntegrations(context);

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

        const result = await handleOpenIntegrations(context);

        expect(result).toEqual({ success: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showIntegrations');
    });
});
