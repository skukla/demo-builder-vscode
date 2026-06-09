/**
 * JoinStorefrontCommand
 *
 * Webview command for the content-SC "Join a shared storefront" flow. Renders the
 * JoinStorefrontScreen and routes its messages through `joinHandlers`:
 * - `resolve-join` → unauthenticated public read of the master → JoinDescriptor
 * - `join-confirm` → (follow-up) launch the gallery-less seeded wizard
 *
 * Follows the BaseWebviewCommand + object-literal handler-map pattern (mirrors
 * ShowProjectsListCommand).
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { joinHandlers } from '@/features/project-creation/handlers/joinHandlers';
import { HandlerContext, SharedState } from '@/types/handlers';

export class JoinStorefrontCommand extends BaseWebviewCommand {
    /**
     * Set once the user confirms a join, so the panel's disposal (the wizard is
     * taking over) does NOT reopen the projects list. On a plain close (cancel)
     * this stays false and the projects list is re-surfaced — see dispose().
     */
    private navigatingForward = false;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('@/core/state').StateManager,
        logger: import('@/types/logger').Logger,
    ) {
        super(context, stateManager, logger);
    }

    protected getWebviewId(): string {
        return 'demoBuilder.joinStorefront';
    }

    protected getWebviewTitle(): string {
        return 'Join a Shared Storefront';
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'joinStorefront',
        });
        const nonce = this.getNonce();
        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: 'Join a Shared Storefront',
        });
    }

    protected async getInitialData(): Promise<{ theme: string }> {
        const themeKind = vscode.window.activeColorTheme.kind;
        return { theme: themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light' };
    }

    protected getLoadingMessage(): string {
        return 'Loading…';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        for (const messageType of getRegisteredTypes(joinHandlers)) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                const result = await dispatchHandler(joinHandlers, context, messageType, data);
                // A confirmed join has launched the seeded wizard — hand off to it:
                // mark forward navigation (so dispose() won't reopen the projects
                // list) and close this panel so no stale Join tab lingers.
                if (messageType === 'join-confirm' && (result as { success?: boolean })?.success) {
                    this.navigatingForward = true;
                    this.panel?.dispose();
                }
                return result;
            });
        }
    }

    public async execute(): Promise<void> {
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
        }
    }

    /**
     * Opening the Join screen disposed the projects list (single-surface model),
     * so on a plain close we re-surface it — otherwise the user is stranded on a
     * blank editor. Suppressed when handing off forward to the seeded wizard.
     * Mirrors the Project Dashboard's auto-reopen safety net.
     */
    public override dispose(): void {
        const reopenProjectsList = !this.navigatingForward;
        super.dispose();
        if (reopenProjectsList) {
            void vscode.commands.executeCommand('demoBuilder.showProjectsList');
        }
    }

    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.joinStorefront');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - OK
            }
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
