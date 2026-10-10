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
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

function makeContext() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn(),
        panel: createMockWebviewPanel(),
        stateManager: createMockStateManager({ getCurrentProject: jest.fn() }),
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
    });
}

beforeEach(() => jest.clearAllMocks());

describe.each([
    ['openDataInstaller', 'demoBuilder.showDataInstaller'],
    // Site access works with no project, so it opens beside the dashboard too.
    ['openSiteAccess', 'demoBuilder.manageSiteAccess'],
    // The Storefront Report opens as a document beside the dashboard.
    ['openStorefrontReport', 'demoBuilder.storefrontReport'],
] as const)('%s', (type, commandId) => {
    it('is registered — positive control for the assertions below', () => {
        expect(dashboardHandlers[type]).toBeInstanceOf(Function);
    });

    it('dispatches its command and reports success', async () => {
        const result = await dashboardHandlers[type](makeContext(), undefined);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(commandId);
        expect(result).toEqual({ success: true });
    });

    /** The rule this handler exists to keep. */
    it('leaves the dashboard open — the surface is not project-scoped', async () => {
        const dispose = jest.fn();
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(
            createMockWebviewPanel({ dispose })
        );

        await dashboardHandlers[type](makeContext(), undefined);

        expect(dispose).not.toHaveBeenCalled();
    });

    it('does not start a webview transition either', async () => {
        const transition = jest.spyOn(BaseWebviewCommand, 'startWebviewTransition');

        await dashboardHandlers[type](makeContext(), undefined);

        expect(transition).not.toHaveBeenCalled();
    });

    /** A failed dispatch must not take the dashboard down with it. */
    it('reports rather than throws when the command fails', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(
            new Error('command missing')
        );
        const context = makeContext();

        // The REASON has to survive: the dashboard shows what it was told, and a
        // bare `undefined` from an emptied catch reads as a silent success.
        await expect(dashboardHandlers[type](context, undefined)).resolves.toEqual({
            success: false,
            error: 'command missing',
        });
    });

    // VS Code rejects some commands with a bare string rather than an Error; the
    // reason is still what the dashboard has to be told.
    it('reports the reason when what was thrown is not an Error', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce('no such command');

        await expect(dashboardHandlers[type](makeContext(), undefined)).resolves.toStrictEqual({
            success: false,
            error: 'no such command',
        });
    });
});
