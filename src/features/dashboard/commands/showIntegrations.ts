/**
 * ShowIntegrationsCommand — the dedicated integrations surface
 *
 * The full-width home for App Builder integrations, opened from the dashboard's
 * integrations summary tile. Replaces the dashboard's in-page grid section: the
 * card grid needs ~1060px to read as three columns and a detail panel beside it,
 * neither of which fits the dashboard's ~900px content band alongside the status
 * header and action tiles (see `.rptc/plans/integrations-surface/overview.md`).
 *
 * Registers the EXISTING `dashboardHandlers` map wholesale — the grid's messages
 * (add/deploy/redeploy/verify/remove/rename, the console-API trio, openLiveSite)
 * already live there.
 *
 * PLUS the wizard messages the REUSED add-integration modal sends. That modal is
 * the wizard's own component ({@link AddIntegrationFlowAdapter}), so its message
 * dependencies are the WIZARD's, not this surface's — and an unregistered type
 * is not an error, it is silence: the request simply never resolves and the
 * picker hangs until it times out. Anything the reused flow posts must be
 * registered here.
 *
 * Live updates arrive on the same push channels the dashboard uses; their
 * senders resolve whichever project panel is live (`getLiveProjectPanel`), so
 * they reach this surface once the dashboard panel is disposed by the swap.
 *
 * @module features/dashboard/commands/showIntegrations
 */

import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { StateManager } from '@/core/state';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { addIntegrationFlowHandlers } from '@/features/project-creation/handlers/addIntegrationFlowHandlers';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

export class ShowIntegrationsCommand extends BaseWebviewCommand {
    constructor(context: vscode.ExtensionContext, stateManager: StateManager, logger: Logger) {
        super(context, stateManager, logger);
    }

    protected getWebviewId(): string {
        return 'demoBuilder.integrations';
    }

    protected getWebviewTitle(): string {
        return 'Integrations';
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'integrations',
        });

        return getWebviewHTML({
            scriptUri,
            nonce: this.getNonce(),
            cspSource: this.panel.webview.cspSource,
            title: 'Integrations',
        });
    }

    protected getLoadingMessage(): string {
        return 'Loading Integrations...';
    }

    /**
     * Seeds the grid: the keyed component map, the stack-filtered catalog for the
     * add picker, and the shared deploy destination (project + workspace TITLES,
     * which the manifest carries — the banner names where every integration in
     * this project deploys).
     */
    protected async getInitialData(): Promise<Record<string, unknown>> {
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        const project = await this.stateManager.getCurrentProject();

        return {
            theme,
            projectName: project?.name ?? '',
            hasAdobeContext: Boolean(project?.adobe?.organization),
            appBuilderComponents: project?.appBuilderComponents,
            appBuilderComponentCatalog: this.resolveCatalog(project ?? null),
            destination: {
                projectTitle: project?.adobe?.projectTitle,
                workspaceTitle: project?.adobe?.workspaceTitle,
            },
            // The committed destination IDS (not titles). The add flow's stage
            // machine reads these as booleans — projectCommitted /
            // workspaceCommitted — to collapse the destination stages to the
            // informational summary on a live project.
            adobeProjectId: project?.adobe?.projectId,
            adobeWorkspaceId: project?.adobe?.workspace,
            // isAdobeSignedIn() reads adobeAuth + adobeOrg, NOT the project id —
            // without the org the add flow walks the sign-in/project/workspace
            // stages instead of collapsing to the summary.
            adobeOrgId: project?.adobe?.organization,
        };
    }

    /** Stack-filtered catalog for the add-integration picker (same rule as the dashboard). */
    private resolveCatalog(project: Project | null): AppBuilderComponentCatalogEntry[] {
        return getAvailableAppBuilderComponents(
            project?.componentSelections?.backend ?? '',
            project?.componentSelections?.frontend ?? '',
        );
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // The reused flow's OWN contract — not a copy of it. See
        // `addIntegrationFlowHandlers`; adding a message to the flow is one edit
        // there and this panel gets it.
        for (const messageType of getRegisteredTypes(addIntegrationFlowHandlers)) {
            comm.onStreaming(messageType, async (data: unknown) => {
                return dispatchHandler(
                    addIntegrationFlowHandlers,
                    this.createHandlerContext(),
                    messageType,
                    data,
                );
            });
        }
        // The whole dashboard map — the grid's own messages. Registered SECOND on
        // purpose: `switchOrg` is in both, and the dashboard's variant (forced
        // sign-in THEN a status re-check, which re-surfaces a persisting mismatch)
        // is the one this surface wants. `messageHandlers` is a Map, so the later
        // registration replaces rather than adding a second listener.
        for (const messageType of getRegisteredTypes(dashboardHandlers)) {
            comm.onStreaming(messageType, async (data: unknown) => {
                return dispatchHandler(
                    dashboardHandlers,
                    this.createHandlerContext(),
                    messageType,
                    data,
                );
            });
        }
    }

    /** Dispose any active integrations panel (used by sibling surfaces on swap). */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.integrations');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
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
        // ONE complete context from the shared factory — no per-panel guessing about
        // which managers its (possibly reused) handlers will reach for.
        return createPanelHandlerContext({
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
        });
    }
}
