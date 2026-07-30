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
 * already live there, so this surface needs ZERO new handlers.
 *
 * Live updates arrive on the same push channels the dashboard uses; their
 * senders resolve whichever project panel is live (`getLiveProjectPanel`), so
 * they reach this surface once the dashboard panel is disposed by the swap.
 *
 * @module features/dashboard/commands/showIntegrations
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { StateManager } from '@/core/state';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { HandlerContext, SharedState } from '@/types/handlers';
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
        // The whole dashboard map — this surface adds no handlers of its own.
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
        return {
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: undefined as unknown as HandlerContext['authManager'],
            errorLogger: undefined as unknown as HandlerContext['errorLogger'],
            progressUnifier: undefined as unknown as HandlerContext['progressUnifier'],
            stepLogger: undefined as unknown as HandlerContext['stepLogger'],
            logger: this.logger,
            debugLogger: this.logger,
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
            sharedState: { isAuthenticating: false } as SharedState,
        };
    }
}
