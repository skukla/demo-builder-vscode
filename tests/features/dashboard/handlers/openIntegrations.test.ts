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

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

// Org targeting is ambient; the only way to observe it is the wrapper.
const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
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

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { handleOpenIntegrations } from '@/features/dashboard/handlers/dashboardHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
const mockTransition = BaseWebviewCommand as unknown as {
    startWebviewTransition: jest.Mock;
    endWebviewTransition: jest.Mock;
    getActivePanel: jest.Mock;
};

const mockGetTokenStatus = jest.fn().mockResolvedValue({ isAuthenticated: true });
const mockGetServicesForOrg = jest.fn().mockResolvedValue([]);

function createMockContext(project: unknown = PROJECT) {
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
        getTokenStatus: mockGetTokenStatus,
        getServicesForOrg: mockGetServicesForOrg,
    });
    return {
        logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
        sendMessage: jest.fn(),
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
    };
}

const PROJECT = {
    name: 'demo',
    path: '/p',
    adobe: { organization: 'org-A', projectId: 'p1', workspace: 'w1' },
};

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

    // Opening this surface is the last cheap moment before the user needs the
    // Adobe API catalog: `getServicesForOrg` is one call, but a highly variable
    // one — 348ms on a warm endpoint, 42s on a cold one, measured minutes apart
    // on the same org. Nothing warmed it, so the first consumer was always a
    // modal that BLOCKS on it behind a spinner. The fetcher already caches
    // per-org for 30 minutes and single-flights, so warming here cannot cause a
    // second fetch — a later opener joins this one or reads its result.
    describe('API catalog prefetch', () => {
        it('warms the org services catalog, org-targeted', async () => {
            const context = createMockContext();

            await handleOpenIntegrations(context as never);
            await settle();

            expect(mockGetServicesForOrg).toHaveBeenCalledWith('org-A');
            expect(mockWithOrgContext).toHaveBeenCalled();
        });

        it('never blocks the surface on it', async () => {
            // A slow or hanging catalog fetch must not delay the tab swap: the
            // whole point is that the wait happens while the user reads the grid.
            const context = createMockContext();
            mockGetServicesForOrg.mockReturnValue(new Promise(() => undefined));

            const result = await handleOpenIntegrations(context as never);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showIntegrations');
        });

        it('does NOT run when signed out — a prefetch must never open a browser', async () => {
            // The standing rule: no background path may trigger interactive Adobe
            // auth. getTokenStatus reads the token file directly (no CLI call, no
            // popup), so the guard itself is silent too.
            const context = createMockContext();
            mockGetTokenStatus.mockResolvedValue({ isAuthenticated: false });

            await handleOpenIntegrations(context as never);
            await settle();

            expect(mockGetServicesForOrg).not.toHaveBeenCalled();
        });

        it('does NOT run without an org to target', async () => {
            const context = createMockContext({ name: 'demo', path: '/p' });

            await handleOpenIntegrations(context as never);
            await settle();

            expect(mockGetServicesForOrg).not.toHaveBeenCalled();
        });

        it('swallows a prefetch failure — the surface still opens', async () => {
            const context = createMockContext();
            mockGetServicesForOrg.mockRejectedValue(new Error('catalog down'));

            const result = await handleOpenIntegrations(context as never);
            await settle();

            expect(result).toEqual({ success: true });
        });
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
