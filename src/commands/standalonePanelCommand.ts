/**
 * A webview that stands beside whatever is open rather than replacing it, and
 * works with no project selected — the Data Installer and Site access.
 *
 * Owns what those panels had pasted between them: the bundle HTML, registering
 * every handler map in one loop (an unregistered type is silence — the request
 * hangs to its timeout), the panel handler context, and opening.
 *
 * @module commands/standalonePanelCommand
 */

import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { asDisplayName, getProjectDisplayName, type ProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerMap } from '@/types/handlers';
import type { ThemeMode } from '@/types/webview';

export abstract class StandalonePanelCommand<TInitialData> extends BaseWebviewCommand<TInitialData> {
    /** The `WEBVIEW_ENTRIES` key in `esbuild.config.js`. */
    protected abstract readonly bundleName: string;

    /** Every map whose types this panel answers. Registered whole, never per-message. */
    protected abstract handlerMaps(): readonly HandlerMap[];

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: this.bundleName,
        });
        // No `baseUri`: remote images load because getWebviewHTML already resolves
        // img-src to [cspSource, https:, data:]. baseUri serves LOCAL dist/ media,
        // which these panels have none of.
        return getWebviewHTML({
            scriptUri,
            nonce: this.getNonce(),
            cspSource: this.panel.webview.cspSource,
            title: this.getWebviewTitle(),
        });
    }

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

    private createHandlerContext(): HandlerContext {
        // The shared factory fills every manager, so handlers reused from other
        // features find what they expect rather than an undefined cast.
        return createPanelHandlerContext({
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
        });
    }
}
