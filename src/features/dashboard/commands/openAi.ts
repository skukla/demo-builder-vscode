import * as path from 'path';
import * as vscode from 'vscode';
import { aiHandlers } from '../handlers/aiHandlers';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ServiceLocator } from '@/core/di';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { Project } from '@/types';
import type { HandlerContext, SharedState } from '@/types/handlers';

/**
 * Initial data sent to the AI overview webview.
 */
interface AiOverviewInitialData {
    theme: 'dark' | 'light';
    project: Project;
}

/**
 * ShowAiCommand — opens the standalone AI surface (Batch E1).
 *
 * Mirrors the ConfigureProjectWebviewCommand shape: a singleton webview panel
 * wired up to the new `aiHandlers` map. The AI surface is harness-agnostic —
 * the title is "AI", not "Claude Code". The URI launch underneath is still
 * Claude-specific, but that's an implementation detail handled by the
 * `openInClaude` route.
 */
export class ShowAiCommand extends BaseWebviewCommand {
    /**
     * Dispose any active AI panel (used during navigation / reset).
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.openAi');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
    }

    protected getWebviewId(): string {
        return 'demoBuilder.openAi';
    }

    protected getWebviewTitle(): string {
        return 'AI';
    }

    protected getLoadingMessage(): string {
        return 'Loading AI overview...';
    }

    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found. Open a Demo Builder project to use AI.');
                return;
            }

            await this.createOrRevealPanel();

            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            this.logger.debug(`[AI] Opened AI overview for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open AI overview', error as Error);
        }
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'aiOverview',
        });

        const nonce = this.getNonce();

        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel.webview.asWebviewUri(mediaPath);

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: 'AI',
            baseUri,
        });
    }

    protected async getInitialData(): Promise<AiOverviewInitialData> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            throw new Error('No project found');
        }

        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            ? 'dark'
            : 'light';

        return {
            theme,
            project,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        const messageTypes = getRegisteredTypes(aiHandlers);
        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(aiHandlers, context, messageType, data);
            });
        }
    }

    /**
     * Create handler context for message handlers. Mirrors the Configure command —
     * the AI handlers reuse the same shape (stateManager + context.globalState).
     */
    private createHandlerContext(): HandlerContext {
        return {
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: ServiceLocator.getAuthenticationService(),
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

            sharedState: {
                isAuthenticating: false,
            } as SharedState,
        };
    }
}
