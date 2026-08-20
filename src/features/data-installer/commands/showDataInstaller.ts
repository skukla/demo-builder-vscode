/**
 * Data Installer panel command.
 *
 * A standalone surface, unlike the project-scoped tabs: the datapack catalog is
 * global to the service, so this panel deliberately does NOT dispose the dashboard
 * or projects list when it opens. Browsing datapacks should not close what the user
 * was looking at.
 *
 * The whole handler map is registered in one loop, so Stage 2 and 3 message types
 * arrive with no wiring here. That matters because an unregistered type is silence
 * rather than an error — the webview request never resolves and hangs to its
 * timeout.
 *
 * @module features/data-installer/commands/showDataInstaller
 */

import * as vscode from 'vscode';
import { dataInstallerHandlers, handleOpenDataInstallerSettings, importHandlers } from '../handlers';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import type { StateManager } from '@/core/state/stateManager';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import {
    asDisplayName,
    getProjectDisplayName,
    type ProjectDisplayName,
} from '@/core/utils/projectDisplayName';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

const WEBVIEW_ID = 'demoBuilder.dataInstaller';
const TITLE = 'Data Installer';

export class ShowDataInstallerCommand extends BaseWebviewCommand {
    constructor(context: vscode.ExtensionContext, stateManager: StateManager, logger: Logger) {
        super(context, stateManager, logger);
    }

    protected getWebviewId(): string {
        return WEBVIEW_ID;
    }

    protected getWebviewTitle(): string {
        return TITLE;
    }

    protected getLoadingMessage(): string {
        return 'Loading Data Installer...';
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'dataInstaller',
        });

        // No `baseUri`: remote cover art loads because getWebviewHTML already
        // resolves img-src to [cspSource, https:, data:]. baseUri exists to serve
        // LOCAL dist/ media, which this surface has none of.
        return getWebviewHTML({
            scriptUri,
            nonce: this.getNonce(),
            cspSource: this.panel.webview.cspSource,
            title: TITLE,
        });
    }

    /**
     * Seed the first frame.
     *
     * Deliberately thin, and deliberately project-independent: the catalog is not
     * project-scoped, so this panel opens and works with no project selected. The
     * project name rides along only so the import flow (Stage 2) can name a default
     * target without a second round trip.
     */
    protected async getInitialData(): Promise<Record<string, unknown>> {
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        const project = await this.stateManager.getCurrentProject();

                // Annotated, because `getInitialData` returns `Record<string, unknown>`
        // and erases this the moment it enters the payload. The annotation puts
        // the check where the mistake would actually be MADE -- swap this for
        // `project.name` and it stops compiling here, at the assignment, rather
        // than surfacing as a slug on screen weeks later.
        const projectName: ProjectDisplayName = project
            ? getProjectDisplayName(project)
            : asDisplayName('');
        return {
            theme,
            projectName,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Whole maps in one loop — never a per-message list. A type that is in a
        // map but not registered here would hang its request silently.
        //
        // Two maps, kept separate at the source: the READ map is what the MCP
        // descriptors mirror, and datapack writes are held back from agents on
        // purpose. The panel needs both, so it registers their union.
        for (const map of [dataInstallerHandlers, importHandlers]) {
            for (const messageType of getRegisteredTypes(map)) {
                comm.onStreaming(messageType, async (data: unknown) => {
                    return dispatchHandler(map, this.createHandlerContext(), messageType, data);
                });
            }
        }

        // Registered on its own because it belongs to NEITHER map: it is a VS Code
        // UI action, and the read map is mirrored by the MCP descriptors, where a
        // window-opening command has no business being offered to an agent.
        //
        // The panel needs it for the same reason the wizard does. `apiBaseUrl` has
        // no default, so an unconfigured install meets the refusal before it meets
        // a catalog, and naming a settings key the user must then hunt for is half
        // an answer on every surface, not just the wizard's.
        const settingsMap = { 'open-data-installer-settings': handleOpenDataInstallerSettings };
        comm.onStreaming('open-data-installer-settings', async (data: unknown) =>
            dispatchHandler(
                settingsMap,
                this.createHandlerContext(),
                'open-data-installer-settings',
                data,
            ),
        );
    }

    /** Dispose any active Data Installer panel (used by sibling surfaces on swap). */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel(WEBVIEW_ID);
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Already disposed — fine.
            }
        }
    }

    public async execute(): Promise<void> {
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
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
