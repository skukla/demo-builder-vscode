/**
 * `openDataInstaller` — the dashboard tile's extension-side half.
 *
 * Deliberately NOT modelled on `openIntegrations`, which is the tempting
 * neighbour. That one replaces the tab: it starts a webview transition, disposes
 * the dashboard panel, then dispatches. It does that because the integrations
 * surface is scoped to the project you came from.
 *
 * The datapack catalog is global to the SERVICE — the same 25 packs whatever
 * project is open — so browsing it must not close what you were looking at. The
 * command's own registration records that decision; this handler has to honour
 * it, which makes it the simpler of the two: dispatch, and touch nothing else.
 *
 * Strict TDD: written BEFORE the handler exists.
 */

import * as vscode from 'vscode';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';

function makeContext() {
    return {
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn(),
        panel: {},
        stateManager: createMockStateManager({ getCurrentProject: jest.fn() }),
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
    } as unknown as HandlerContext;
}

beforeEach(() => jest.clearAllMocks());

describe('openDataInstaller', () => {
    it('is registered — positive control for the assertions below', () => {
        expect(dashboardHandlers.openDataInstaller).toBeInstanceOf(Function);
    });

    it('dispatches the Data Installer command', async () => {
        await dashboardHandlers.openDataInstaller(makeContext(), undefined);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.showDataInstaller',
        );
    });

    /** The rule this handler exists to keep. */
    it('leaves the dashboard open — the catalog is global, not project-scoped', async () => {
        const dispose = jest.fn();
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            dispose,
        } as never);

        await dashboardHandlers.openDataInstaller(makeContext(), undefined);

        expect(dispose).not.toHaveBeenCalled();
    });

    it('does not start a webview transition either', async () => {
        const transition = jest.spyOn(BaseWebviewCommand, 'startWebviewTransition');

        await dashboardHandlers.openDataInstaller(makeContext(), undefined);

        expect(transition).not.toHaveBeenCalled();
    });

    /** A failed dispatch must not take the dashboard down with it. */
    it('reports rather than throws when the command fails', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(
            new Error('command missing'),
        );
        const context = makeContext();

        await expect(
            dashboardHandlers.openDataInstaller(context, undefined),
        ).resolves.not.toThrow();
    });
});
