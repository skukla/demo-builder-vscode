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
    /**
     * Deep-link: when the surface is opened to edit a specific prompt (e.g. via
     * the AI QuickPick's inline edit button), this carries that prompt's id so
     * a FRESH open can open its edit dialog directly. For an already-open panel,
     * the id is pushed via an `open-edit-prompt` message instead.
     */
    editPromptId?: string;
}

/**
 * ShowAiCommand — opens the standalone AI surface.
 *
 * Mirrors the ConfigureProjectWebviewCommand shape: a singleton webview panel
 * wired up to the new `aiHandlers` map. The AI surface is harness-agnostic —
 * the title is "AI", not "Claude Code". The URI launch underneath is still
 * Claude-specific, but that's an implementation detail handled by the
 * `openInClaude` route.
 */
export class ShowAiCommand extends BaseWebviewCommand {
    /**
     * Deep-link target for a FRESH open. Captured in `execute` and surfaced in
     * `getInitialData` so the webview opens that prompt's edit dialog on mount.
     */
    private editPromptId?: string;

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
        // Edit launches render a focused dialog, not the overview — don't
        // mislabel the brief loading screen as "AI overview".
        return this.editPromptId ? 'Loading…' : 'Loading AI overview...';
    }

    /**
     * Skip the shared loading floor for the AI surface: natural bundle/handshake
     * time is enough, and the focused edit dialog should appear immediately
     * rather than behind a 1.5s "Loading…" screen.
     */
    protected getMinLoadingMs(): number {
        return 0;
    }

    public async execute(arg?: { editPromptId?: string }): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found. Open a Demo Builder project to use AI.');
                return;
            }

            // Capture whether the panel was already open BEFORE createOrRevealPanel
            // wires up a comm manager. A fresh open re-fetches initial data (which
            // carries `editPromptId`); an already-open panel does not, so we push
            // an `open-edit-prompt` message instead.
            const wasOpen = Boolean(this.communicationManager);
            this.editPromptId = arg?.editPromptId;

            const panel = await this.createOrRevealPanel();

            // Title reflects intent: a fresh edit launch shows "Edit Prompt"
            // (the surface renders edit-only); a manage launch shows "AI". On a
            // manage launch over an already-open (possibly edit-only) panel, push
            // `set-manage-mode` so the webview drops back to the full grid.
            if (arg?.editPromptId) {
                panel.title = 'Edit Prompt';
            } else {
                panel.title = 'AI';
            }

            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            this.subscribeToSurfaceChanges();

            if (wasOpen && arg?.editPromptId) {
                await this.sendMessage('open-edit-prompt', { promptId: arg.editPromptId });
            } else if (wasOpen && !arg?.editPromptId) {
                await this.sendMessage('set-manage-mode');
            }

            this.logger.debug(`[AI] Opened AI overview for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open AI overview', error as Error);
        }
    }

    /**
     * Push a `surface-changed` message to the webview when the user toggles
     * `demoBuilder.ai.surface` via VS Code settings. The webview re-runs
     * verify-ai-setup so extension-only affordances (Browse Claude sessions)
     * appear or disappear without a manual reload of the AI dashboard.
     */
    private subscribeToSurfaceChanges(): void {
        const listener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('demoBuilder.ai.surface')) {
                void this.sendMessage('surface-changed');
            }
        });
        this.disposables.add(listener);
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
            editPromptId: this.editPromptId,
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

        // Edit-only surfaces post `close-ai-panel` when their dialog closes so
        // the user returns to the chat. Dispose the panel directly — there's no
        // grid state to preserve.
        comm.on('close-ai-panel', async () => {
            this.panel?.dispose();
            return { success: true };
        });
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
