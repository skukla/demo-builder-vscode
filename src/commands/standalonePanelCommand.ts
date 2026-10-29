/**
 * A webview that stands beside whatever is open rather than replacing it, and
 * works with no project selected — the Data Installer and Site access.
 *
 * Owns what those panels had pasted between them: registering every handler map
 * in one loop (an unregistered type is silence — the request hangs to its
 * timeout), and opening. The bundle HTML and the handler context come from
 * `BundledPanelCommand`, which every bundled panel shares.
 *
 * @module commands/standalonePanelCommand
 */

import * as vscode from 'vscode';
import { BundledPanelCommand } from '@/commands/bundledPanelCommand';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { asDisplayName, getProjectDisplayName, type ProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { HandlerMap } from '@/types/handlers';
import type { ThemeMode } from '@/types/webview';

export abstract class StandalonePanelCommand<TInitialData> extends BundledPanelCommand<TInitialData> {
    /** Every map whose types this panel answers. Registered whole, never per-message. */
    protected abstract handlerMaps(): readonly HandlerMap[];

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        for (const map of this.handlerMaps()) {
            for (const messageType of getRegisteredTypes(map)) {
                comm.onStreaming(messageType, async (data: unknown) =>
                    dispatchHandler(map, this.createHandlerContext(), messageType, data),
                );
            }
        }
    }

    public async execute(): Promise<void> {
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
    }

    protected themeMode(): ThemeMode {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    }

    /** Empty when nothing is open — these panels work with no project. */
    protected projectNameOf(project: Project | undefined): ProjectDisplayName {
        return project ? getProjectDisplayName(project) : asDisplayName('');
    }
}
