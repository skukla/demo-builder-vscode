import * as vscode from 'vscode';
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
 * A single row in the prompt picker. `action` drives selection dispatch;
 * `promptBody` is present only on prompt rows so the insert handler can act on
 * it.
 */
interface PromptPickerItem extends vscode.QuickPickItem {
    action?: 'insert' | 'manage';
    promptBody?: string;
}

/**
 * ShowPromptsPickerCommand — single-purpose prompt picker.
 *
 * Always shows the prompt QuickPick — no state-aware branching. Selecting a
 * prompt dispatches `demoBuilder.openInClaude` with `{ prompt }`, which opens
 * or focuses the Claude terminal and bracketed-paste-injects the prompt.
 * "Manage prompts…" dispatches `demoBuilder.openAi` (the prompt library).
 *
 * Replaces the chat-vs-picker state branch in the retired `AiMenuCommand`. The
 * sidebar's "Prompts" button is the primary caller; the command palette entry
 * "Demo Builder: Show Prompts" surfaces it for keyboard users.
 */
export class ShowPromptsPickerCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = (await this.stateManager.getCurrentProject()) ?? undefined;

        const prompts = readMergedAiPrompts(this.handlerContext(), project);
        const selected = await showWebviewQuickPick<PromptPickerItem>(this.buildItems(prompts), {
            title: `Prompts · ${project?.name ?? 'No project'}`,
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
     * prompt library, reached via "Manage prompts…".
     */
    private buildItems(prompts: AiPrompt[]): PromptPickerItem[] {
        const promptItems: PromptPickerItem[] = prompts.map((prompt: AiPrompt) => ({
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
    private async dispatchAction(item: PromptPickerItem): Promise<void> {
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
