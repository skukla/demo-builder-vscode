/**
 * ShowProjectsListCommand
 *
 * Command to show the Projects List as the main home screen.
 * Displays all projects in a card grid layout using the existing ProjectsDashboard UI.
 *
 * Step 1 of Projects Navigation Architecture: Create Projects List as Home Screen
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import {
    getWebviewHTMLWithBundles,
    type BundleUris,
} from '@/core/utils/getWebviewHTMLWithBundles';
import { ProjectsListHandlerRegistry } from '@/features/projects-dashboard/handlers';
import { HandlerContext, SharedState } from '@/types/handlers';

/**
 * Command to show the "Projects List" as the home screen
 * This provides a card grid view of all projects with search/filter.
 *
 * Follows BaseWebviewCommand pattern with HandlerRegistry.
 */
export class ShowProjectsListCommand extends BaseWebviewCommand {
    private handlerRegistry: ProjectsListHandlerRegistry;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('@/core/state').StateManager,
        statusBar: import('@/core/vscode/StatusBarManager').StatusBarManager,
        logger: import('@/core/logging').Logger,
    ) {
        super(context, stateManager, statusBar, logger);
        this.handlerRegistry = new ProjectsListHandlerRegistry();
    }

    // ============================================================================
    // BaseWebviewCommand Implementation
    // ============================================================================

    protected getWebviewId(): string {
        return 'demoBuilder.projectsList';
    }

    protected getWebviewTitle(): string {
        return 'Projects';
    }

    protected async getWebviewContent(): Promise<string> {
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

        /**
         * Webpack code splitting requires loading bundles in order:
         * 1. runtime (webpack runtime and chunk loading)
         * 2. vendors (React, Spectrum, third-party libraries)
         * 3. common (shared code including WebviewClient)
         * 4. projectsList (projects list specific code)
         *
         * This pattern eliminates single-bundle timeout issues in VS Code webviews.
         */
        const bundleUris: BundleUris = {
            runtime: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js')),
            ),
            vendors: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js')),
            ),
            common: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'common-bundle.js')),
            ),
            feature: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'projectsList-bundle.js')),
            ),
        };

        const nonce = this.getNonce();

        // Build HTML with 4-bundle pattern
        return getWebviewHTMLWithBundles({
            bundleUris,
            nonce,
            cspSource: this.panel!.webview.cspSource,
            title: 'Projects',
            additionalImgSources: ['https:', 'data:'],
        });
    }

    protected async getInitialData(): Promise<{
        theme: string;
    }> {
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
        };
    }

    protected getLoadingMessage(): string {
        return 'Loading Projects...';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register all handlers from ProjectsListHandlerRegistry
        const messageTypes = this.handlerRegistry.getRegisteredTypes();

        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return this.handlerRegistry.handle(context, messageType, data);
            });
        }
    }

    // ============================================================================
    // Public API
    // ============================================================================

    /**
     * Static method to dispose any active Projects List panel
     * Useful for cleanup during reset or navigation
     */
    public static disposeActivePanel(): void {
        const activePanels = BaseWebviewCommand['activePanels'] as Map<string, vscode.WebviewPanel>;
        const projectsListPanel = activePanels.get('demoBuilder.projectsList');
        if (projectsListPanel) {
            projectsListPanel.dispose();
        }
    }

    // ============================================================================
    // Lifecycle Hooks
    // ============================================================================

    public async execute(): Promise<void> {
        this.logger.debug('[ProjectsList] Showing projects list');

        // Create or reveal panel and initialize communication
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Create handler context with all dependencies
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers (projects list doesn't use all managers, but context requires them)
            // Using type assertion since handlers don't actually use these managers
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: undefined as unknown as HandlerContext['authManager'],
            componentHandler: undefined as unknown as HandlerContext['componentHandler'],
            errorLogger: undefined as unknown as HandlerContext['errorLogger'],
            progressUnifier: undefined as unknown as HandlerContext['progressUnifier'],
            stepLogger: undefined as unknown as HandlerContext['stepLogger'],

            // Loggers
            logger: this.logger,
            debugLogger: this.logger,

            // VS Code integration
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),

            // Shared state (projects list doesn't use shared state)
            sharedState: {
                isAuthenticating: false,
            } as SharedState,
        };
    }
}
