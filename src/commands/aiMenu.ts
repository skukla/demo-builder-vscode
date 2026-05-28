import * as vscode from 'vscode';
import { isClaudeChatOpen } from './openInClaude';
import { BaseCommand } from '@/core/base';
import { showWebviewQuickPick } from '@/core/utils/quickPickUtils';
import { readMergedAiPrompts } from '@/features/dashboard/handlers/aiHandlers';
import type { AiPrompt } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** Max characters of a prompt body shown inline (as the row description). */
const PROMPT_PREVIEW_MAX_LENGTH = 70;

/** Placeholder shown in the prompt QuickPick. */
const PICKER_PLACEHOLDER = 'Insert a prompt, or manage prompts';

/**
 * A single row in the AI QuickPick menu. `action` drives selection dispatch;
 * `promptBody` is present only on prompt rows so the insert handler can act on
 * it.
 */
interface AiMenuItem extends vscode.QuickPickItem {
    action?: 'insert' | 'manage';
    promptBody?: string;
}

/**
 * AiMenuCommand — the chat-first AI entry point (the wand icon).
 *
 * State-aware behavior:
 *   - No live chat terminal → launch the chat directly (zero-friction first
 *     open). The terminal is observable, so we skip the picker on a cold start.
 *   - Chat alive → show the QuickPick for prompt insertion.
 *
 * The QuickPick shows the merged prompt list (pinned first) and a
 * "Manage prompts…" action. Selecting a prompt inserts it via
 * `demoBuilder.openInClaude` (which also focuses the live terminal);
 * "Manage prompts…" opens the prompt library (`demoBuilder.openAi`).
 */
export class AiMenuCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = (await this.stateManager.getCurrentProject()) ?? undefined;

        // Zero-friction first-launch shortcut: no terminal yet → spawn one.
        if (!isClaudeChatOpen()) {
            await vscode.commands.executeCommand('demoBuilder.openAiExperience');
            return;
        }

        const prompts = readMergedAiPrompts(this.handlerContext(), project);
        const selected = await showWebviewQuickPick<AiMenuItem>(this.buildItems(prompts), {
            title: `AI · ${project?.name ?? 'No project'}`,
            placeholder: PICKER_PLACEHOLDER,
            matchOnDescription: true,
        });

        if (selected) {
            await this.dispatchAction(selected);
        }
    }

    /**
     * Build the menu: prompt rows (pinned first via the merge) → "Manage
     * prompts…". Creating, editing, deleting, and pinning all live in the
     * prompt library, reached via "Manage prompts…". The picker only ever
     * appears when a chat terminal is already alive, so a "focus the chat"
     * row would be redundant — selecting any prompt focuses the live
     * terminal anyway as part of `openInClaude`.
     */
    private buildItems(prompts: AiPrompt[]): AiMenuItem[] {
        const promptItems: AiMenuItem[] = prompts.map((prompt: AiPrompt) => ({
            label: prompt.title,
            description: this.truncate(prompt.prompt),
            action: 'insert',
            promptBody: prompt.prompt,
        }));

        return [
            { label: 'Prompts', kind: vscode.QuickPickItemKind.Separator },
            ...promptItems,
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(gear) Manage prompts…', action: 'manage' },
        ];
    }

    /** Route the selected item to the matching command. */
    private async dispatchAction(item: AiMenuItem): Promise<void> {
        switch (item.action) {
            case 'insert':
                await vscode.commands.executeCommand('demoBuilder.openInClaude', {
                    prompt: item.promptBody,
                });
                break;
            case 'manage':
                await vscode.commands.executeCommand('demoBuilder.openAi');
                break;
            default:
                break;
        }
    }

    /** Truncate a prompt body for the inline preview. */
    private truncate(text: string): string {
        return text.length > PROMPT_PREVIEW_MAX_LENGTH
            ? `${text.slice(0, PROMPT_PREVIEW_MAX_LENGTH)}…`
            : text;
    }

    /**
     * Build the minimal `HandlerContext` shape the prompt helper reads — only
     * `context`, `stateManager`, and `logger`. The remaining HandlerContext
     * fields are unused by `readMergedAiPrompts`.
     */
    private handlerContext(): HandlerContext {
        return {
            context: this.context,
            stateManager: this.stateManager,
            logger: this.logger,
        } as unknown as HandlerContext;
    }
}
