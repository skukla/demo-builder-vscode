import * as vscode from 'vscode';
import { aiHandlers } from '../handlers/aiHandlers';
import { BundledPanelCommand } from '@/commands/bundledPanelCommand';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import type { AiOverviewInitialData } from '@/types/webviewPayloads';

/**
 * ShowAiCommand — opens the prompt library webview.
 *
 * Mirrors the ConfigureProjectWebviewCommand shape: a singleton webview panel
 * wired up to the `aiHandlers` map. The library is the single home for creating,
 * editing, deleting, and pinning prompts, reached on demand from the AI
 * QuickPick's "Manage prompts…" action. It is harness-agnostic — the URI launch
 * underneath is Claude-specific, but that's an implementation detail handled by
 * the `openInClaude` route.
 */
export class ShowAiCommand extends BundledPanelCommand<AiOverviewInitialData> {
    protected readonly bundleName = 'aiOverview';
    protected override readonly servesLocalMedia = true;

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
        return 'Prompt Library';
    }

    protected getLoadingMessage(): string {
        return 'Loading prompt library';
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

            this.logger.debug(`[AI] Opened prompt library for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open prompts', error as Error);
        }
    }

    // No surface-changed listener any more: it watched `demoBuilder.ai.surface`,
    // a setting RETIRED in 7bbe1bd9 (removed from package.json; openInClaude
    // resets leftover values as "legacy"). An unregistered key cannot be set,
    // so the listener could never fire and its docstring claimed a user
    // affordance that no longer exists. Nothing webview-side awaited the
    // message either — found by the 2026-08-21 settings-seam audit.

    protected async getInitialData(): Promise<AiOverviewInitialData> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            throw new Error('No project found');
        }

        const theme =
            vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

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

        // The footer "Close" button posts `cancel`; dispose the panel so the
        // Prompt Library tab closes (mirrors the Configure surface's cancel).
        comm.on('cancel', async () => {
            this.panel?.dispose();
            return { success: true };
        });
    }
}
