/**
 * Door 3 — the Prompt Workbench panel.
 *
 * Type a prompt, simulate it, see what it WOULD do and what it would cost,
 * apply a suggestion, simulate again and watch the delta, then run it for real
 * or save it.
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
import { aiHandlers, readMergedAiPrompts } from '@/features/dashboard/handlers/aiHandlers';
import type { AiPrompt, Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type {
    EvaluationWorkbenchInitialData,
    WorkbenchMode,
    WorkbenchOpenPayload,
} from '@/types/webviewPayloads';

const TITLE = 'Prompt Workbench';

export class ShowEvaluationWorkbenchCommand extends BaseWebviewCommand<EvaluationWorkbenchInitialData> {
    /**
     * What the last opening asked for — the mode, and any prompt handed over.
     *
     * Three doors share one panel and initial data is sent once, so an opening
     * that reaches an ALREADY OPEN workbench has to push instead. Held here so
     * `getInitialData` and the push answer with the same thing.
     */
    private opening: WorkbenchOpenPayload = { mode: 'prompt' };

    protected getWebviewId(): string {
        return 'demoBuilder.evaluationWorkbench';
    }

    protected getWebviewTitle(): string {
        return TITLE;
    }

    protected getLoadingMessage(): string {
        return 'Opening…';
    }

    /**
     * Open the workbench, optionally on a saved prompt.
     *
     * @param options.mode - which half to show; defaults to the prompt workbench
     * @param options.promptId - a saved prompt to load, from the Prompt
     *   Library's "Open in workbench". The ID, never the text: the prompt is resolved
     *   from the extension's own stores, so a webview cannot put words in the
     *   workbench that are not in the library.
     */
    public async execute(
        options: { mode?: WorkbenchMode; promptId?: string } = {},
    ): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning(
                    'Open a Demo Builder project first — a prompt is evaluated against one.',
                );
                return;
            }

            const prompt = this.resolvePrompt(options.promptId, project);
            this.opening = { mode: options.mode ?? 'prompt', ...(prompt ? { prompt } : {}) };

            await this.createOrRevealPanel();
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }
            // Sent every time, including the first: the handshake queues it, and
            // an already-open panel has no other way to hear about an opening.
            await this.sendMessage('workbench-open', this.opening);
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

    protected async getInitialData(): Promise<EvaluationWorkbenchInitialData> {
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
            ...this.opening,
        };
    }

    /**
     * The saved prompt behind an id, from the extension's own stores.
     *
     * Reads the MERGED list — pinned prompts live in global state and per-project
     * ones in the manifest, and the library shows both, so resolving from either
     * alone would silently fail to find half of them.
     *
     * @param promptId - the id from the library card, or undefined
     * @param project - the current project, for its per-project prompts
     * @returns the prompt, or undefined when there is no id or no match
     */
    private resolvePrompt(promptId: string | undefined, project: Project): AiPrompt | undefined {
        if (!promptId) return undefined;
        const found = readMergedAiPrompts({ context: this.context }, project).find(
            (p) => p.id === promptId,
        );
        if (!found) {
            // Not an error worth a dialog: a prompt deleted between the click
            // and the open leaves an empty workbench, which is usable.
            this.logger.debug(`[Evaluation] no saved prompt with id ${promptId}`);
        }
        return found;
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
