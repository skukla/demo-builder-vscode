import * as vscode from 'vscode';
import { isClaudeChatOpen } from './openInClaude';
import { BaseCommand } from '@/core/base';
import { showWebviewQuickPick } from '@/core/utils/quickPickUtils';
import { deleteAiPromptById, readMergedAiPrompts } from '@/features/dashboard/handlers/aiHandlers';
import type { AiPrompt } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** Max characters of a prompt body shown inline (as the row description). */
const PROMPT_PREVIEW_MAX_LENGTH = 70;

/** Placeholder shown in the prompt QuickPick. */
const PICKER_PLACEHOLDER = 'Select a prompt to insert, or manage prompts';

/**
 * A single row in the AI QuickPick menu. `action` drives selection dispatch;
 * `promptId` / `promptBody` are present only on prompt rows so the insert +
 * item-button handlers can act on them.
 */
interface AiMenuItem extends vscode.QuickPickItem {
    action?: 'insert' | 'manage' | 'new';
    promptId?: string;
    promptBody?: string;
}

/**
 * AiMenuCommand — the chat-first, state-aware AI entry point.
 *
 * When no live Claude Code chat terminal is open, the icon opens the chat
 * directly (`demoBuilder.openAiExperience`) — there is no redundant "Open Chat"
 * menu row. When a chat IS open, it shows a prompt QuickPick listing the merged
 * prompt list (pinned first) with inline edit + delete buttons, plus Manage /
 * New actions. Selecting a prompt inserts it into Claude Code via
 * `demoBuilder.openInClaude`; Manage / New open the prompt manager
 * (`demoBuilder.openAi`); edit deep-links the manager to that prompt's edit
 * dialog; delete confirms then delegates to `deleteAiPromptById`.
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
            onItemButton: (event) => this.handleItemButton(event),
        });

        if (selected) {
            await this.dispatchAction(selected);
        }
    }

    /**
     * Build the ordered menu from a prompt list: Prompts section → one row per
     * prompt (pinned already first via the merge) → Manage / New. No "Open Chat"
     * row — the chat-open state is handled in `execute`. The body preview is the
     * row `description` (same line as the title) so the inline edit/delete
     * buttons render vertically centered (two-line rows top-align them).
     */
    private buildItems(prompts: AiPrompt[]): AiMenuItem[] {
        const editButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('edit'),
            tooltip: 'Edit',
        };
        const deleteButton: vscode.QuickInputButton = {
            iconPath: new vscode.ThemeIcon('trash'),
            tooltip: 'Delete',
        };

        const promptItems: AiMenuItem[] = prompts.map((prompt: AiPrompt) => ({
            label: prompt.title,
            description: this.truncate(prompt.prompt),
            action: 'insert',
            promptId: prompt.id,
            promptBody: prompt.prompt,
            buttons: [editButton, deleteButton],
        }));

        return [
            { label: 'Prompts', kind: vscode.QuickPickItemKind.Separator },
            ...promptItems,
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(gear) Manage prompts…', action: 'manage' },
            { label: '$(add) New prompt…', action: 'new' },
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
            case 'new':
                await vscode.commands.executeCommand('demoBuilder.openAi');
                break;
            default:
                break;
        }
    }

    /**
     * Edit → open the prompt manager focused on that prompt's edit dialog, then
     * hide. Delete → confirm (modal), then delegate to `deleteAiPromptById` and
     * refresh the menu items from the authoritative returned list (re-reading
     * the captured `project` would show the just-deleted prompt again).
     */
    private async handleItemButton(
        event: {
            item: AiMenuItem;
            button: vscode.QuickInputButton;
            quickPick: vscode.QuickPick<AiMenuItem>;
        },
    ): Promise<void> {
        const { item, button, quickPick } = event;
        if (button.tooltip === 'Edit') {
            await vscode.commands.executeCommand('demoBuilder.openAi', {
                editPromptId: item.promptId,
            });
            quickPick.hide();
            return;
        }
        if (button.tooltip === 'Delete' && item.promptId) {
            const confirmed = await vscode.window.showWarningMessage(
                `Delete "${item.label}"?`,
                { modal: true },
                'Delete',
            );
            if (confirmed !== 'Delete') {
                return;
            }
            // Re-fetch the current project so repeated deletes operate on fresh
            // state; refresh from the returned merged list (not the stale project).
            const current = (await this.stateManager.getCurrentProject()) ?? undefined;
            const remaining = await deleteAiPromptById(this.handlerContext(), current, item.promptId);
            quickPick.items = this.buildItems(remaining);
        }
    }

    /** Truncate a prompt body for the inline preview. */
    private truncate(text: string): string {
        return text.length > PROMPT_PREVIEW_MAX_LENGTH
            ? `${text.slice(0, PROMPT_PREVIEW_MAX_LENGTH)}…`
            : text;
    }

    /**
     * Build the minimal `HandlerContext` shape the prompt helpers read — only
     * `context`, `stateManager`, and `logger`. The remaining HandlerContext
     * fields are unused by `readMergedAiPrompts` / `deleteAiPromptById`.
     */
    private handlerContext(): HandlerContext {
        return {
            context: this.context,
            stateManager: this.stateManager,
            logger: this.logger,
        } as unknown as HandlerContext;
    }
}
