import * as os from 'os';
import * as path from 'path';
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
 * Resolve the projects root the home Chat always launches at:
 * `DEMO_BUILDER_PROJECTS_DIR` if set, else `~/.demo-builder/projects`.
 */
export function resolveProjectsRoot(): string {
    return process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
}

/**
 * Re-home preamble prepended to a prompt when it's delivered into a CONTINUED
 * conversation (terminal reuse, or a spawn that resumes via `--continue`). A
 * resumed conversation doesn't re-read the home `AGENTS.md`, so it can keep stale
 * "current project" context. This makes the agent re-resolve the active project
 * via the MCP tool before acting — preserving the always-root home model (the
 * Chat never cd's into a project; the current-project pointer is the source of
 * truth). A cold spawn reads `AGENTS.md` and self-homes, so it gets no preamble.
 */
export const REHOME_PROMPT_PREFIX =
    'Before responding, call the get_current_project tool to re-confirm the active demo '
    + 'project (it may have changed since this conversation started), then address the '
    + 'request below.\n\n';

/**
 * OpenInClaudeCommand — opens Claude Code (`claude --continue`) in a VS Code
 * integrated terminal placed as a tab in the active editor group (next to
 * Project Dashboard).
 *
 * Always launches at the projects root (`resolveProjectsRoot()`), never at a
 * project subdir. This is the single "home" Chat: the VS Code window stays
 * homed at the projects root, the home `.mcp.json` there points at the root
 * socket, and the agent addresses any project by name through the in-extension
 * MCP tools (e.g. `get_current_project`). Nothing anchors the workspace to a
 * project; no window reload happens here.
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
        // Only the prompt matters now — any project arg is ignored. The home Chat
        // always launches at the projects root so one session addresses any
        // project by name via the in-extension MCP tools.
        const { prompt } = normalizeArg(arg);
        const cwd = resolveProjectsRoot();

        this.logger.info(`[Open in Claude] cwd=${cwd} prompt=${prompt ? 'yes' : 'no'}`);

        try {
            await this.launchTerminal(cwd, prompt);
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
     * Launch `claude --continue` in an integrated terminal at `cwd`,
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
    private async launchTerminal(cwd: string, prompt?: string): Promise<void> {
        if (!cwd) {
            this.logger.error('[Open in Claude] cannot launch terminal: cwd missing');
            await vscode.window.showErrorMessage(
                'Cannot open Claude Code: no directory is available.',
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
            this.logger.info('[Open in Claude] terminal reused');
            if (prompt) {
                // Reuse case: claude is already at its REPL (a CONTINUED conversation)
                // — re-home it to the active project, then inject the prompt.
                this.injectPromptViaBracketedPaste(REHOME_PROMPT_PREFIX + prompt);
                this.maybeShowClipboardFallbackTip();
            }
            return;
        }

        // Chat-first: open the terminal as a tab in the active editor group
        // (next to Project Dashboard), not a side split.
        const terminal = this.createTerminal(TERMINAL_NAME, cwd, {
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
        const useContinue = hasClaudeConversation(cwd);
        const continueFlag = useContinue ? ' --continue' : '';
        // Resuming a conversation (`--continue`) won't re-read AGENTS.md, so carry
        // the re-home preamble. A cold start self-homes from AGENTS.md → no preamble.
        const effectivePrompt = prompt && useContinue ? REHOME_PROMPT_PREFIX + prompt : prompt;
        const launchCommand = effectivePrompt
            ? `claude${continueFlag} -- ${this.quotePromptForShell(effectivePrompt)}`
            : `claude${continueFlag}`;
        terminal.sendText(launchCommand);
        this.logger.info(
            `[Open in Claude] terminal spawned (location=editor-active, prompt=${prompt ? 'yes' : 'no'}, resume=${useContinue ? 'yes' : 'no'})`,
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
    // Legacy pending-launch record, retired in the always-root home-Chat model.
    // Still cleared so users upgrading from the anchor-on-demand build don't
    // carry a dead record forward.
    await context.globalState.update('demoBuilder.ai.pendingClaudeLaunch', undefined);

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
