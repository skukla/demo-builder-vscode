import * as vscode from 'vscode';
import { hasConversation as hasClaudeConversation } from './claudeSessionStore';
import { BaseCommand } from '@/core/base';
import type { Project } from '@/types/base';

/**
 * The AI engine — which AI tool Demo Builder launches.
 *
 * Today Claude Code is the only supported engine. The type is kept so a future
 * engine (Codex, etc.) can be added without restructuring the launch path.
 */
export type Engine = 'claude-code';

/**
 * globalState key tracking whether the soft "prompt sent to Claude; clipboard
 * fallback available" tip has been shown. Fires once-ever on the first prompt
 * click so the user learns the contract (auto-insert with clipboard fallback)
 * without repeated noise.
 */
const CLIPBOARD_FALLBACK_TIP_SHOWN_KEY = 'demoBuilder.ai.clipboardFallbackTipShown';

/**
 * globalState key for the pending Claude launch record written when the
 * prompt-click / home-grid handlers need to anchor the workspace before
 * launching. Consumed on activation by `extension.ts`. Shape:
 *   `{ projectPath: string; prompt?: string; createdAt: number }`
 */
export const PENDING_CLAUDE_LAUNCH_KEY = 'demoBuilder.ai.pendingClaudeLaunch';

/** Terminal name displayed in the integrated terminals dropdown. */
const TERMINAL_NAME = 'Claude Code';

/**
 * Find the live "Claude Code" chat terminal, if one is open. "Live" means a
 * terminal whose name matches and whose `exitStatus` is `undefined` (the shell
 * is still running). Shared by the launch reuse path and the `isClaudeChatOpen`
 * state check so the matching logic lives in one place.
 */
export function findLiveClaudeTerminal(): vscode.Terminal | undefined {
    return vscode.window.terminals.find(
        (t) => t.name === TERMINAL_NAME && t.exitStatus === undefined,
    );
}

/**
 * Whether a live Claude Code chat terminal is currently open. Backs the
 * state-aware AI icon: when no chat is open the AI menu launches the chat
 * directly instead of showing the prompt QuickPick.
 */
export function isClaudeChatOpen(): boolean {
    return findLiveClaudeTerminal() !== undefined;
}

/**
 * Argument shape accepted by `OpenInClaudeCommand.execute`. Supports the legacy
 * positional `Project` arg for backwards compatibility and the
 * `{ project?, prompt? }` payload.
 */
export type OpenInClaudeArg = Project | { project?: Project; prompt?: string };

/**
 * OpenInClaudeCommand — opens Claude Code (`claude --continue`) for the current
 * project in a VS Code integrated terminal placed as a tab in the active editor
 * group (next to Project Dashboard).
 *
 * The chat is a persistent terminal session: subsequent invocations reuse the
 * live terminal and inject the prompt via bracketed paste, keeping the
 * conversation continuous. The prompt is also copied to the clipboard as a
 * silent fallback.
 *
 * Demo Builder previously also offered an "extension" surface that URI-launched
 * the Claude Code VS Code extension's chat panel. That surface was retired
 * because the extension's URI handler treats every launch as a new chat — there
 * is no public API to inject a prompt into the live chat — so the wand's
 * "pick a prompt, drop it into the conversation" model can't work there.
 */
export class OpenInClaudeCommand extends BaseCommand {
    public async execute(arg?: OpenInClaudeArg): Promise<void> {
        const { project, prompt } = normalizeArg(arg);
        const target = project ?? (await this.stateManager.getCurrentProject() ?? undefined);

        this.logger.info(`[Open in Claude] project=${target?.name ?? '<none>'} prompt=${prompt ? 'yes' : 'no'}`);
        try {
            await this.launchTerminal(target, prompt);
        } catch (error) {
            this.logger.error(
                `[Open in Claude] failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            await vscode.window.showErrorMessage(
                `Failed to open Claude Code: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /**
     * Launch `claude --continue` in an integrated terminal at `project.path`,
     * reusing an existing "Claude Code" terminal if one is still alive.
     *
     * When `prompt` is provided, delivery depends on spawn vs reuse:
     *   - Spawn: pass the prompt to `claude --continue <prompt>` as a launch
     *     argument. Race-free — claude receives it the moment it starts, with
     *     no waiting for the REPL and nothing to drop. claude runs it
     *     immediately (auto-submits).
     *   - Reuse: claude is already running and can't take a new launch arg, so
     *     inject into the live REPL via bracketed paste, which pre-fills the
     *     input for the user to send.
     * The clipboard is always written too as a silent fallback.
     *
     * Terminal location (chat-first): new spawns open as a tab in the active
     * editor group (`{ viewColumn: ViewColumn.Active }`) — next to Project
     * Dashboard — not a split.
     */
    private async launchTerminal(project: Project | undefined, prompt?: string): Promise<void> {
        if (!project || !project.path) {
            this.logger.error('[Open in Claude] cannot launch terminal: project path missing');
            await vscode.window.showErrorMessage(
                'Cannot open Claude Code: no project directory is available.',
            );
            return;
        }

        // Clipboard fallback — always write so the user has a safety net.
        // Silent unless the one-time tip toast hasn't yet shown.
        if (prompt) {
            await vscode.env.clipboard.writeText(prompt);
            this.logger.debug('[Open in Claude] prompt copied to clipboard (silent fallback)');
        }

        const existing = findLiveClaudeTerminal();
        if (existing) {
            existing.show();
            this.logger.info(`[Open in Claude] terminal reused (project=${project.name})`);
            if (prompt) {
                // Reuse case: claude is already at its REPL — inject immediately.
                this.injectPromptViaBracketedPaste(prompt);
                this.maybeShowClipboardFallbackTip();
            }
            return;
        }

        // Chat-first: open the terminal as a tab in the active editor group
        // (next to Project Dashboard), not a side split.
        const terminal = this.createTerminal(TERMINAL_NAME, project.path, {
            viewColumn: vscode.ViewColumn.Active,
        });
        terminal.show();
        // Deliver the prompt as a launch argument so claude runs it on startup —
        // no waiting for the REPL, no dropped paste. `--` marks end-of-options so
        // a prompt that starts with a dash is taken as text, not a flag.
        //
        // Only pass `--continue` when a prior conversation exists for this cwd.
        // `claude --continue` on cold start prints "No conversation found to
        // continue" and exits, leaving the user with a dead terminal. The
        // session-store probe (`claudeSessionStore.hasConversation`) checks
        // `~/.claude/projects/<encoded-cwd>/` for any `.jsonl` transcript.
        const useContinue = hasClaudeConversation(project.path);
        const continueFlag = useContinue ? ' --continue' : '';
        const launchCommand = prompt
            ? `claude${continueFlag} -- ${this.quotePromptForShell(prompt)}`
            : `claude${continueFlag}`;
        terminal.sendText(launchCommand);
        this.logger.info(
            `[Open in Claude] terminal spawned (project=${project.name}, location=editor-active, prompt=${prompt ? 'yes' : 'no'}, resume=${useContinue ? 'yes' : 'no'})`,
        );

        if (prompt) {
            this.maybeShowClipboardFallbackTip();
        }
    }

    /**
     * Inject the prompt into the active terminal via bracketed-paste escape
     * sequences (CSI 200~ / CSI 201~). Bracketed-paste tells the receiving
     * REPL (claude ≥ 2.1.108) that the input is pasted content — preserves
     * multi-line and does not auto-submit. The user reviews and hits Enter.
     */
    private injectPromptViaBracketedPaste(prompt: string): void {
        const PASTE_START = '\x1b[200~';
        const PASTE_END = '\x1b[201~';
        void vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
            text: PASTE_START + prompt + PASTE_END,
        });
    }

    /**
     * POSIX-quote a prompt for use as a single shell argument. Wraps the whole
     * string in single quotes and escapes any embedded single quote as `'\''`
     * (close, escaped quote, reopen). Safe for spaces, `$`, backticks, double
     * quotes, and newlines (all literal inside single quotes).
     */
    private quotePromptForShell(prompt: string): string {
        return `'${prompt.replace(/'/g, "'\\''")}'`;
    }

    /**
     * Show the soft "prompt sent; clipboard fallback available" tip once-ever
     * so the user learns the contract without repeated notifications. Flag is
     * set BEFORE the toast shows (race-safe).
     */
    private maybeShowClipboardFallbackTip(): void {
        const already = this.context.globalState.get<boolean>(
            CLIPBOARD_FALLBACK_TIP_SHOWN_KEY,
            false,
        );
        if (already) return;
        void this.context.globalState.update(CLIPBOARD_FALLBACK_TIP_SHOWN_KEY, true);
        void vscode.window.showInformationMessage(
            'Prompt sent to Claude. Also on your clipboard if you need to paste.',
        );
    }
}

/**
 * Reset all AI-related state back to factory defaults. Clears the clipboard
 * tip flag, the pending-launch record, and any legacy settings/flags left
 * over from the retired extension surface and dock-to-right offer. Used by
 * the dev-only Reset AI Onboarding command so the first-run experience can
 * be tested repeatedly.
 *
 * Idempotent — safe to call when nothing was previously set.
 */
export async function resetAiOnboardingState(context: vscode.ExtensionContext): Promise<void> {
    // Active one-time flags
    await context.globalState.update(CLIPBOARD_FALLBACK_TIP_SHOWN_KEY, undefined);
    await context.globalState.update(PENDING_CLAUDE_LAUNCH_KEY, undefined);

    // Legacy flags from the retired extension surface + dock-to-right offer.
    // Cleared so users who installed older Demo Builder versions don't carry
    // dead state forward.
    await context.globalState.update('demoBuilder.ai.extensionAvailableOfferShown', undefined);
    await context.globalState.update('demoBuilder.ai.extensionMismatchWarningShown', undefined);
    await context.globalState.update('demoBuilder.ai.firstLaunchDialogShown', undefined);
    await context.globalState.update('demoBuilder.ai.sessionsBrowserAutoShown', undefined);
    await context.globalState.update('demoBuilder.ai.onboardingCompleted', undefined);
    await context.globalState.update('demoBuilder.ai.firstClaudeOpenTipShown', undefined);

    // Legacy AI user-settings — back to package.json defaults.
    const aiConfig = vscode.workspace.getConfiguration('demoBuilder.ai');
    await aiConfig.update('surface', undefined, vscode.ConfigurationTarget.Global);
    await aiConfig.update('dockToRight', undefined, vscode.ConfigurationTarget.Global);

    // Clear any `claudeCode.preferredLocation` value Demo Builder wrote in
    // earlier versions; with the extension surface retired we no longer touch
    // it, but existing users may still carry our prior write.
    const claudeConfig = vscode.workspace.getConfiguration('claudeCode');
    await claudeConfig.update('preferredLocation', undefined, vscode.ConfigurationTarget.Global);
}

/**
 * Normalize the polymorphic execute argument into `{ project, prompt }`.
 *
 * Accepts:
 *   - `undefined` → both undefined
 *   - A `Project` (legacy positional form, identified by a `path` property)
 *   - A `{ project?, prompt? }` payload
 */
function normalizeArg(arg: OpenInClaudeArg | undefined): {
    project: Project | undefined;
    prompt: string | undefined;
} {
    if (arg === undefined || arg === null) {
        return { project: undefined, prompt: undefined };
    }
    if (typeof arg === 'object' && 'path' in arg) {
        return { project: arg as Project, prompt: undefined };
    }
    const payload = arg as { project?: Project; prompt?: string };
    return { project: payload.project, prompt: payload.prompt };
}
