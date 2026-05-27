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
const PICKER_PLACEHOLDER = 'Select a prompt to insert, or manage prompts';

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
 * AiMenuCommand — the chat-first, state-aware AI entry point.
 *
 * When no live Claude Code chat terminal is open, the icon opens the chat
 * directly (`demoBuilder.openAiExperience`) — there is no redundant "Open Chat"
 * menu row. When a chat IS open, it shows an insert-only prompt QuickPick: the
 * merged prompt list (pinned first) plus a "Manage prompts…" action. Selecting a
 * prompt inserts it into Claude Code via `demoBuilder.openInClaude`; "Manage
 * prompts…" opens the prompt library (`demoBuilder.openAi`) — the single home
 * for creating, editing, deleting, and pinning prompts.
 */
export class AiMenuCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = (await this.stateManager.getCurrentProject()) ?? undefined;

        // State-aware: no chat open → open the chat and stop. Opening the chat
        // (via openAiExperience) warms the terminal, so there's nothing to
        // prewarm here.
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
     * Build the insert-only menu: a Prompts section → one row per prompt (pinned
     * already first via the merge) → "Manage prompts…". The body preview is the
     * row `description` (same line as the title). Creating, editing, deleting,
     * and pinning all live in the prompt library, reached via "Manage prompts…".
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
