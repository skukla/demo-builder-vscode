import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import type { Project } from '@/types/base';

/**
 * The AI engine — which AI tool Demo Builder launches.
 *
 * Today Claude Code is the only supported engine. The setting is split from
 * `surface` so that future engines (Codex, etc.) can be added without
 * renaming the launch-surface knob.
 */
export type Engine = 'claude-code';

/**
 * The launch surface for the configured engine.
 *
 * - `extension`: Launch the engine's official VS Code extension via URI handler.
 *   For Claude Code that's `anthropic.claude-code`'s URI handler with optional
 *   `?prompt=` pre-fill.
 * - `terminal`: Launch the engine's CLI in a VS Code integrated terminal at the
 *   project root. For Claude Code that's `claude --continue` plus clipboard
 *   handoff for prompts.
 */
export type Surface = 'extension' | 'terminal';

/** Claude Code extension marketplace identifier. */
const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

/** URI handler exposed by the Claude Code extension (v2.1.72+). */
const CLAUDE_CODE_URI = 'vscode://anthropic.claude-code/open';

/** globalState key tracking whether the first-time "drag-to-sidebar" tip has been shown. */
const FIRST_TIP_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';

/**
 * globalState key tracking whether the workspace-mismatch warning has been
 * shown for the `surface='extension'` case. Fires once ever (persistent
 * globalState) — same pattern as the first-tip key.
 */
const MISMATCH_WARNING_KEY = 'demoBuilder.ai.extensionMismatchWarningShown';

/**
 * globalState key tracking whether the first-launch setup dialog has been
 * shown. Fires once ever; dismissal counts (user took an action OR closed
 * the dialog without picking).
 */
export const FIRST_LAUNCH_DIALOG_SHOWN_KEY = 'demoBuilder.ai.firstLaunchDialogShown';

/**
 * globalState key for the pending Claude launch record written when the
 * prompt-click handler needs to anchor the workspace before launching.
 * Consumed on activation by `extension.ts`. Shape:
 *   `{ projectPath: string; prompt: string; createdAt: number }`
 */
export const PENDING_CLAUDE_LAUNCH_KEY = 'demoBuilder.ai.pendingClaudeLaunch';

/** Terminal name displayed in the integrated terminals dropdown. */
const TERMINAL_NAME = 'Claude Code';

/** Dialog action labels — exported so the activation handler can reuse them. */
export const INSTALL_ACTION_LABEL = 'Install Claude Code Extension';
export const SWITCH_TO_TERMINAL_ACTION_LABEL = 'Switch to Terminal Mode';

/**
 * Argument shape accepted by `OpenInClaudeCommand.execute`. Supports the legacy
 * positional `Project` arg for backwards compatibility and the
 * `{ project?, prompt? }` payload.
 */
export type OpenInClaudeArg = Project | { project?: Project; prompt?: string };

/**
 * OpenInClaudeCommand — opens Claude Code for the current project.
 *
 * Reads two settings:
 *   - `demoBuilder.ai.engine` (currently always `'claude-code'`; reserved for
 *     future engines like Codex).
 *   - `demoBuilder.ai.surface` — the launch surface:
 *       * `extension` — URI launch via the Claude Code VS Code extension.
 *         Pre-fills prompts in the chat panel input. Missing-extension is a
 *         configuration error: a dialog blocks the action with two recovery
 *         affordances.
 *       * `terminal` — Find-or-spawn the "Claude Code" terminal at
 *         `project.path`; on spawn, run `claude --continue` so multi-prompt
 *         clicks chain into one conversation. When a prompt is provided,
 *         write it to the clipboard so the user can paste it with one
 *         keystroke.
 *
 * First successful URI launch shows a one-time drag-to-sidebar tip via globalState.
 * The globalState write happens BEFORE the `showInformationMessage` call so a
 * quick second invocation does not double-fire the tip.
 */
export class OpenInClaudeCommand extends BaseCommand {
    /**
     * Execute the Open in Claude Code action for the given (or current) project.
     *
     * @param arg Either a `Project` (legacy positional form) or a payload of
     *            `{ project?, prompt? }`. When `prompt` is provided,
     *            the URI handler launches with `?prompt=<encoded>` so Claude
     *            Code opens with the prompt pre-filled in its input.
     */
    public async execute(arg?: OpenInClaudeArg): Promise<void> {
        const { project, prompt } = normalizeArg(arg);
        const target = project ?? (await this.stateManager.getCurrentProject() ?? undefined);

        const engine = this.getEngine();
        const surface = this.getSurface();
        this.logger.info(`[Open in Claude] engine=${engine} surface=${surface} project=${target?.name ?? '<none>'}`);

        try {
            if (surface === 'terminal') {
                this.logger.info('[Open in Claude] launching via terminal');
                await this.launchTerminal(target, prompt);
                return;
            }

            // surface === 'extension'
            const extensionInstalled = this.isClaudeCodeExtensionInstalled();
            this.logger.debug(`[Open in Claude] extension installed: ${extensionInstalled}`);

            if (!extensionInstalled) {
                this.logger.warn('[Open in Claude] extension surface selected but Claude Code extension is not installed');
                await this.handleMissingExtensionDialog(target, prompt);
                return;
            }

            const workspaceMatches = this.isWorkspaceAnchoredToProject(target);
            if (!workspaceMatches) {
                // User chose the extension surface but workspace is not the
                // project. URI launch will inherit the wrong cwd. Warn once
                // ever so they understand why context is missing. (Prompt-click
                // flows bypass this via the pending-prompt + reload mechanism
                // in aiHandlers + extension.ts:activate.)
                await this.maybeShowMismatchWarning();
            }
            this.logger.info('[Open in Claude] launching via extension URI handler');
            await this.launchViaUri(target, prompt);
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
     * Read `demoBuilder.ai.engine` (defaults to `'claude-code'`, the only
     * currently-supported engine). Reserved for future engines like Codex.
     */
    private getEngine(): Engine {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<Engine>('engine', 'claude-code');
    }

    /** Read `demoBuilder.ai.surface` (defaults to `'extension'`). */
    private getSurface(): Surface {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<Surface>('surface', 'extension');
    }

    /** Detect whether the Claude Code VS Code extension is installed. */
    private isClaudeCodeExtensionInstalled(): boolean {
        return vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID) !== undefined;
    }

    /**
     * Check whether VS Code's first workspace folder is the project we're
     * launching Claude Code against. The chat panel inherits this folder as
     * cwd, so when it doesn't match, per-project `.claude/skills/`, `.mcp.json`,
     * and `AGENTS.md` won't load.
     */
    private isWorkspaceAnchoredToProject(project: Project | undefined): boolean {
        if (!project?.path) return false;
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return wsRoot === project.path;
    }

    /**
     * Surface the configuration-error dialog when `extension` mode is selected
     * but the Claude Code extension is not installed. Offers two recovery
     * actions: install the extension (opens the marketplace) or switch the
     * setting to `terminal` and retry the launch.
     */
    private async handleMissingExtensionDialog(
        project: Project | undefined,
        prompt: string | undefined,
    ): Promise<void> {
        const choice = await vscode.window.showErrorMessage(
            'Claude Code VS Code extension is not installed. Install it from the marketplace, ' +
            'or switch to terminal mode to launch claude in a VS Code integrated terminal.',
            INSTALL_ACTION_LABEL,
            SWITCH_TO_TERMINAL_ACTION_LABEL,
        );
        if (choice === INSTALL_ACTION_LABEL) {
            await vscode.commands.executeCommand('extension.open', CLAUDE_CODE_EXTENSION_ID);
            return;
        }
        if (choice === SWITCH_TO_TERMINAL_ACTION_LABEL) {
            const config = vscode.workspace.getConfiguration('demoBuilder.ai');
            await config.update('surface', 'terminal', vscode.ConfigurationTarget.Global);
            this.logger.info('[Open in Claude] user switched surface to terminal; launching terminal');
            await this.launchTerminal(project, prompt);
        }
        // Dismissed without picking: no action.
    }

    /**
     * Surface a one-time-ever warning when the user has `surface='extension'`
     * but the workspace is not the project. URI launch still proceeds — the
     * warning explains why the chat panel may be missing project context.
     *
     * Marked-shown BEFORE the toast so concurrent invocations don't double-fire.
     */
    private async maybeShowMismatchWarning(): Promise<void> {
        const already = this.context.globalState.get<boolean>(MISMATCH_WARNING_KEY, false);
        if (already) {
            return;
        }
        await this.context.globalState.update(MISMATCH_WARNING_KEY, true);
        this.logger.debug('[Open in Claude] showing one-time workspace-mismatch warning');
        vscode.window.showWarningMessage(
            'Claude Code chat panel will not see this project context — your VS Code ' +
            'workspace is not the project folder. Open the project as your workspace ' +
            'to get full skills + MCP + AGENTS.md context.',
            'Got it',
        );
    }

    /**
     * Launch Claude Code via the extension's documented URI handler. When
     * `prompt` is provided, appends `?prompt=<encoded>` so Claude Code opens
     * with the prompt pre-filled in its input.
     */
    private async launchViaUri(project: Project | undefined, prompt?: string): Promise<void> {
        const uri = prompt
            ? `${CLAUDE_CODE_URI}?prompt=${encodeURIComponent(prompt)}`
            : CLAUDE_CODE_URI;
        const opened = await vscode.env.openExternal(vscode.Uri.parse(uri));
        if (!opened) {
            this.logger.warn('[Open in Claude] vscode.env.openExternal returned false');
            await vscode.window.showWarningMessage(
                'Could not open Claude Code via the extension. Try again, or change ' +
                '`demoBuilder.ai.surface` to `terminal`.',
            );
            return;
        }
        this.logger.info(`[Open in Claude] URI launch succeeded for ${project?.name ?? '<no project>'}`);
        await this.maybeShowFirstTip();
    }

    /**
     * Launch `claude --continue` in an integrated terminal at `project.path`,
     * reusing an existing "Claude Code" terminal if one is still alive.
     *
     * When `prompt` is provided, the prompt is written to the clipboard first
     * and a toast surfaces ("Prompt copied — paste it into Claude") so the
     * user can hand off the prompt with one keystroke.
     *
     * `claude --continue` matches the extension URI handler's behavior of
     * focusing the existing chat — multi-prompt clicks chain into one
     * conversation. The CLI starts a fresh session gracefully when no prior
     * session exists in that cwd.
     */
    private async launchTerminal(project: Project | undefined, prompt?: string): Promise<void> {
        if (!project || !project.path) {
            this.logger.error('[Open in Claude] cannot launch terminal: project path missing');
            await vscode.window.showErrorMessage(
                'Cannot open Claude Code: no project directory is available.',
            );
            return;
        }

        if (prompt) {
            await vscode.env.clipboard.writeText(prompt);
            this.logger.debug('[Open in Claude] prompt copied to clipboard for terminal handoff');
            // Fire-and-forget toast — don't block launch on user dismissal.
            vscode.window.showInformationMessage(
                'Prompt copied to clipboard — paste it into Claude.',
            );
        }

        const existing = vscode.window.terminals.find(t =>
            t.name === TERMINAL_NAME && t.exitStatus === undefined,
        );
        if (existing) {
            existing.show();
            this.logger.info(`[Open in Claude] focused existing terminal for ${project.name}`);
            return;
        }

        const terminal = this.createTerminal(TERMINAL_NAME, project.path);
        terminal.show();
        terminal.sendText('claude --continue');
        this.logger.info(`[Open in Claude] terminal spawned for ${project.name} at ${project.path}`);
    }

    /**
     * Show the one-time drag-to-sidebar tip on the first successful URI launch.
     *
     * IMPORTANT: globalState is updated BEFORE the message is shown so a quick
     * second invocation doesn't double-fire while the first message is still open.
     */
    private async maybeShowFirstTip(): Promise<void> {
        const already = this.context.globalState.get<boolean>(FIRST_TIP_KEY, false);
        if (already) {
            return;
        }
        await this.context.globalState.update(FIRST_TIP_KEY, true);
        this.logger.debug('[Open in Claude] showing first-time drag-to-sidebar tip');
        vscode.window.showInformationMessage(
            'Tip: You can drag the Claude Code panel to the sidebar to keep it visible while you work.',
            'Got it',
        );
    }
}

/**
 * Show the first-launch setup dialog when `surface='extension'` (the default)
 * but the Claude Code extension is not installed. Asks the user to pick a path
 * once at activation; the choice persists via `FIRST_LAUNCH_DIALOG_SHOWN_KEY`.
 *
 * Exported so `extension.ts:activate()` can call it after registrations.
 *
 * Side effects:
 *   - "Install Claude Code Extension" → opens the marketplace.
 *   - "Switch to Terminal Mode" → updates the `demoBuilder.ai.surface` setting.
 *   - Dismissal → no setting change; flag still set so we don't re-prompt.
 */
export async function maybeShowFirstLaunchDialog(
    context: vscode.ExtensionContext,
): Promise<void> {
    const already = context.globalState.get<boolean>(FIRST_LAUNCH_DIALOG_SHOWN_KEY, false);
    if (already) {
        return;
    }
    const config = vscode.workspace.getConfiguration('demoBuilder.ai');
    const surface = config.get<Surface>('surface', 'extension');
    if (surface !== 'extension') {
        // User has already chosen terminal — nothing to nudge.
        await context.globalState.update(FIRST_LAUNCH_DIALOG_SHOWN_KEY, true);
        return;
    }
    if (vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID) !== undefined) {
        // Extension already installed — no nudge needed.
        await context.globalState.update(FIRST_LAUNCH_DIALOG_SHOWN_KEY, true);
        return;
    }
    // Mark shown BEFORE asking so concurrent activations don't double-fire.
    await context.globalState.update(FIRST_LAUNCH_DIALOG_SHOWN_KEY, true);
    const choice = await vscode.window.showInformationMessage(
        'Claude Code is the AI engine. Pick how Demo Builder should launch it: ' +
        'the Claude Code VS Code extension (chat panel inside VS Code) or a terminal running the `claude` CLI.',
        INSTALL_ACTION_LABEL,
        SWITCH_TO_TERMINAL_ACTION_LABEL,
    );
    if (choice === INSTALL_ACTION_LABEL) {
        await vscode.commands.executeCommand('extension.open', CLAUDE_CODE_EXTENSION_ID);
        return;
    }
    if (choice === SWITCH_TO_TERMINAL_ACTION_LABEL) {
        await config.update('surface', 'terminal', vscode.ConfigurationTarget.Global);
    }
    // Dismissed: leave setting at default. Future prompt clicks will show the
    // missing-extension error dialog (same actions) if the user proceeds.
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
