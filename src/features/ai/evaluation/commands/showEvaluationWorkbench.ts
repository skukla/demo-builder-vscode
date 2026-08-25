/**
 * Door 3 — the workbench panel.
 *
 * Type a prompt, see what it WOULD do and what it would cost, apply a
 * suggestion, try it again and watch the delta, then run it for real or save it.
 *
 * Two handler maps are registered, and that is the point: `evaluationHandlers`
 * adds exactly one message (`evaluate-prompt`), and `aiHandlers` supplies the
 * two the Prompt Library already owns — `openInClaude` runs the prompt for real,
 * `save-ai-prompt` keeps it. A surface that re-implemented either would be a
 * second thing to keep correct.
 *
 * @module features/ai/evaluation/commands/showEvaluationWorkbench
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { evaluationHandlers } from '../handlers/evaluationHandlers';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { AiOverviewInitialData } from '@/types/webviewPayloads';

const TITLE = 'Try a Prompt Out';

export class ShowEvaluationWorkbenchCommand extends BaseWebviewCommand<AiOverviewInitialData> {
    protected getWebviewId(): string {
        return 'demoBuilder.evaluationWorkbench';
    }

    protected getWebviewTitle(): string {
        return TITLE;
    }

    protected getLoadingMessage(): string {
        return 'Opening…';
    }

    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning(
                    'Open a Demo Builder project first — a prompt is evaluated against one.',
                );
                return;
            }

            await this.createOrRevealPanel();
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }
            this.logger.debug(`[Evaluation] workbench opened for ${project.name}`);
        } catch (error) {
            await this.showError('Could not open the prompt workbench', error as Error);
        }
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'evaluation',
        });
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));

        return getWebviewHTML({
            scriptUri,
            nonce: this.getNonce(),
            cspSource: this.panel.webview.cspSource,
            title: TITLE,
            baseUri: this.panel.webview.asWebviewUri(mediaPath),
        });
    }

    protected async getInitialData(): Promise<AiOverviewInitialData> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            throw new Error('No project found');
        }
        return {
            theme:
                vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
                    ? 'dark'
                    : 'light',
            project,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // BOTH maps. A message registered in only one of them is not an error —
        // it is SILENCE: the request never resolves and the UI waits forever.
        for (const [map, types] of [
            [evaluationHandlers, getRegisteredTypes(evaluationHandlers)] as const,
            [aiHandlers, getRegisteredTypes(aiHandlers)] as const,
        ]) {
            for (const messageType of types) {
                comm.onStreaming(messageType, async (data: unknown) =>
                    dispatchHandler(map, this.createHandlerContext(), messageType, data),
                );
            }
        }

        comm.on('cancel', async () => {
            this.panel?.dispose();
            return { success: true };
        });
    }

    private createHandlerContext(): HandlerContext {
        return createPanelHandlerContext({
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
        });
    }
}
