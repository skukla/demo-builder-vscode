import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
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
 *   handoff for prompts. This is the baseline surface (no extension dependency).
 */
export type Surface = 'extension' | 'terminal';

/** Claude Code extension marketplace identifier. */
const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

/** URI handler exposed by the Claude Code extension (v2.1.72+). */
const CLAUDE_CODE_URI = 'vscode://anthropic.claude-code/open';

/**
 * globalState key tracking whether the unified dock-to-right offer toast has
 * been shown. The underlying string is preserved from the legacy `FIRST_TIP_KEY`
 * so existing users who already saw the old drag-to-sidebar tip won't see the
 * new toast either — the new toast supersedes the old tip's purpose.
 */
const DOCK_OFFER_SHOWN_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';

/**
 * globalState key tracking whether the "extension installed; want to use it?"
 * offer has been shown. Fires once-ever per workspace; user choice writes the
 * surface setting and routes the current click accordingly.
 */
const EXTENSION_AVAILABLE_OFFER_SHOWN_KEY = 'demoBuilder.ai.extensionAvailableOfferShown';

/**
 * globalState key tracking whether the Claude Code sessions browser has been
 * auto-opened once on first AI dashboard mount. Consumed by `aiHandlers`
 * (`handleMarkSessionsBrowserAutoShown` writes it; `handleVerifyAiSetup` reads
 * it). Colocated here with the other AI-feature globalState keys so feature
 * code does not need to reach into `extension.ts`.
 */
export const SESSIONS_BROWSER_AUTO_SHOWN_KEY = 'demoBuilder.ai.sessionsBrowserAutoShown';

/**
 * globalState key tracking whether the workspace-mismatch warning has been
 * shown for the `surface='extension'` case. Fires once ever (persistent
 * globalState).
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

/** Dock-offer toast action labels. */
const DOCK_ACTION_LABEL = 'Dock to right side';
const KEEP_LAYOUT_ACTION_LABEL = 'Keep current layout';

/** Extension-detected offer toast action labels. */
const USE_EXTENSION_ACTION_LABEL = 'Use the Extension';
const STAY_IN_TERMINAL_ACTION_LABEL = 'Stay in Terminal';

/**
 * Argument shape accepted by `OpenInClaudeCommand.execute`. Supports the legacy
 * positional `Project` arg for backwards compatibility and the
 * `{ project?, prompt? }` payload.
 */
export type OpenInClaudeArg = Project | { project?: Project; prompt?: string };

/** Terminal launch location label used in the spawn log line. */
type TerminalLocationLabel = 'panel' | 'editor-beside';

/**
 * OpenInClaudeCommand — opens Claude Code for the current project.
 *
 * Driven by three settings: `demoBuilder.ai.engine` (the AI tool, currently
 * always `'claude-code'`); `demoBuilder.ai.surface` (`'extension'` or
 * `'terminal'`, default `'terminal'` — the baseline experience that works
 * without any VS Code extension installed); and `demoBuilder.ai.dockToRight`
 * (boolean, single source of truth for "dock the AI experience to the right
 * side" — applies to both surfaces and is kept in sync with
 * `claudeCode.preferredLocation`).
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
        let surface = this.getSurface();
        this.logger.info(`[Open in Claude] engine=${engine} surface=${surface} project=${target?.name ?? '<none>'}`);

        try {
            // Gate 2: when intent is terminal AND capability adds the extension
            // option, offer the upgrade path before launching. User choice may
            // change the surface for this click.
            if (
                surface === 'terminal'
                && this.isClaudeCodeExtensionInstalled()
                && !this.isExtensionOfferShown()
            ) {
                const userChose = await this.maybeOfferExtensionSurface();
                if (userChose === 'extension') {
                    surface = 'extension';
                }
            }

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
                // ever so they understand why context is missing.
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
     * currently-supported engine).
     */
    private getEngine(): Engine {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<Engine>('engine', 'claude-code');
    }

    /**
     * Read `demoBuilder.ai.surface` (defaults to `'terminal'` — the baseline
     * experience that works without any VS Code extension installed).
     */
    private getSurface(): Surface {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<Surface>('surface', 'terminal');
    }

    /** Read `demoBuilder.ai.dockToRight` (defaults to `false`). */
    private getDockToRight(): boolean {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<boolean>('dockToRight', false);
    }

    /** Detect whether the Claude Code VS Code extension is installed. */
    private isClaudeCodeExtensionInstalled(): boolean {
        return vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID) !== undefined;
    }

    /** Whether the extension-detected offer has already been shown to the user. */
    private isExtensionOfferShown(): boolean {
        return this.context.globalState.get<boolean>(EXTENSION_AVAILABLE_OFFER_SHOWN_KEY, false);
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
        this.logger.info('[Open in Claude] recovery dialog shown (extension surface, extension missing)');
        const choice = await vscode.window.showErrorMessage(
            'Claude Code VS Code extension is not installed. Install it from the marketplace, ' +
            'or switch to terminal mode to launch claude in a VS Code integrated terminal.',
            INSTALL_ACTION_LABEL,
            SWITCH_TO_TERMINAL_ACTION_LABEL,
        );
        if (choice === INSTALL_ACTION_LABEL) {
            this.logger.info('[Open in Claude] recovery dialog outcome: install-extension');
            await vscode.commands.executeCommand('extension.open', CLAUDE_CODE_EXTENSION_ID);
            return;
        }
        if (choice === SWITCH_TO_TERMINAL_ACTION_LABEL) {
            this.logger.info('[Open in Claude] recovery dialog outcome: switch-to-terminal');
            const config = vscode.workspace.getConfiguration('demoBuilder.ai');
            await config.update('surface', 'terminal', vscode.ConfigurationTarget.Global);
            await this.launchTerminal(project, prompt);
            return;
        }
        this.logger.info('[Open in Claude] recovery dialog outcome: dismissed');
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
            this.logger.warn('[Open in Claude] openExternal returned false (URI launch silent failure)');
            await vscode.window.showWarningMessage(
                'Could not open Claude Code via the extension. Try again, or change ' +
                '`demoBuilder.ai.surface` to `terminal`.',
            );
            return;
        }
        this.logger.info(`[Open in Claude] URI launch succeeded for ${project?.name ?? '<no project>'}`);
        this.maybeOfferDockToRight('extension');
    }

    /**
     * Launch `claude --continue` in an integrated terminal at `project.path`,
     * reusing an existing "Claude Code" terminal if one is still alive.
     *
     * When `prompt` is provided, the prompt is written to the clipboard first
     * and a toast surfaces ("Prompt copied — paste it into Claude") so the
     * user can hand off the prompt with one keystroke.
     *
     * Terminal location: when `demoBuilder.ai.dockToRight === true`, new
     * spawns open as editor tabs beside the active editor via
     * `{ viewColumn: ViewColumn.Beside }`. Otherwise default panel placement.
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
            this.logger.info(`[Open in Claude] terminal reused (project=${project.name})`);
            return;
        }

        const dockToRight = this.getDockToRight();
        const locationLabel: TerminalLocationLabel = dockToRight ? 'editor-beside' : 'panel';
        const location = dockToRight
            ? { viewColumn: vscode.ViewColumn.Beside }
            : undefined;
        const terminal = this.createTerminal(TERMINAL_NAME, project.path, location);
        terminal.show();
        terminal.sendText('claude --continue');
        this.logger.info(
            `[Open in Claude] terminal spawned (project=${project.name}, location=${locationLabel})`,
        );
        this.maybeOfferDockToRight('terminal');
    }

    /**
     * One-time unified dock-to-right offer toast on a successful launch.
     * Both surfaces share the same flag and the same setting
     * (`demoBuilder.ai.dockToRight`); the toast body wording adapts to which
     * surface just launched. Uses the shared `showOneTimeTip` helper, which
     * marks the flag BEFORE the toast displays (race-safe). Accepting writes
     * BOTH `demoBuilder.ai.dockToRight = true` AND
     * `claudeCode.preferredLocation = 'sidebar'` so the extension natively
     * respects the preference.
     */
    private maybeOfferDockToRight(launchContext: Surface): void {
        if (this.getDockToRight()) {
            // User already chose docked layout — nothing to offer.
            return;
        }

        const body = launchContext === 'extension'
            ? 'Claude Code opened as an editor tab. Dock it to the right side — the chat panel becomes a persistent surface alongside your sessions list. You can drag the title bar to a different position at any time.'
            : 'Claude opened in the bottom panel terminal. Dock it to the right side — future Claude terminals will open as editor tabs beside your code, closer to a chat-panel layout. You can drag any terminal tab to reposition at any time.';

        const shown = showOneTimeTip(this.context.globalState, {
            stateKey: DOCK_OFFER_SHOWN_KEY,
            message: body,
            actions: [DOCK_ACTION_LABEL, KEEP_LAYOUT_ACTION_LABEL],
            onAction: (choice: string) => {
                if (choice === DOCK_ACTION_LABEL) {
                    this.logger.info('[Open in Claude] dock offer outcome: accepted');
                    this.logger.debug('[Open in Claude] dock offer accepted; writing dockToRight=true and claudeCode.preferredLocation=sidebar');
                    const aiConfig = vscode.workspace.getConfiguration('demoBuilder.ai');
                    const claudeConfig = vscode.workspace.getConfiguration('claudeCode');
                    void aiConfig.update('dockToRight', true, vscode.ConfigurationTarget.Global);
                    void claudeConfig.update('preferredLocation', 'sidebar', vscode.ConfigurationTarget.Global);
                } else if (choice === KEEP_LAYOUT_ACTION_LABEL) {
                    this.logger.info('[Open in Claude] dock offer outcome: kept-current');
                }
            },
        });

        if (shown) {
            this.logger.info(`[Open in Claude] dock offer shown (context=${launchContext})`);
        }
    }

    /**
     * Surface the "extension installed; want to use it?" offer toast when the
     * user is on terminal surface but the Claude Code extension is present.
     * Returns the user's chosen surface for this click so the caller can
     * re-dispatch via the correct launch path.
     *
     * The flag is set BEFORE the toast displays (race-safe). Accepting writes
     * `demoBuilder.ai.surface = 'extension'` globally.
     */
    private async maybeOfferExtensionSurface(): Promise<Surface> {
        await this.context.globalState.update(EXTENSION_AVAILABLE_OFFER_SHOWN_KEY, true);
        this.logger.info('[Open in Claude] extension-detected offer shown');

        const choice = await vscode.window.showInformationMessage(
            'The Claude Code extension is installed. Want to use it for AI prompts? You\'ll get a chat panel UI with persistent sessions, instead of a terminal REPL. You can switch back anytime in settings (`demoBuilder.ai.surface`).',
            USE_EXTENSION_ACTION_LABEL,
            STAY_IN_TERMINAL_ACTION_LABEL,
        );

        if (choice === USE_EXTENSION_ACTION_LABEL) {
            this.logger.info('[Open in Claude] extension offer outcome: use-extension');
            this.logger.debug('[Open in Claude] writing surface=extension after user accepted extension offer');
            const config = vscode.workspace.getConfiguration('demoBuilder.ai');
            await config.update('surface', 'extension', vscode.ConfigurationTarget.Global);
            return 'extension';
        }
        if (choice === STAY_IN_TERMINAL_ACTION_LABEL) {
            this.logger.info('[Open in Claude] extension offer outcome: stay-in-terminal');
            return 'terminal';
        }
        this.logger.info('[Open in Claude] extension offer outcome: dismissed');
        return 'terminal';
    }
}

/**
 * Show the first-launch setup dialog when the user has explicitly chosen
 * `surface='extension'` but the Claude Code extension is not installed.
 * Fires once-ever via `FIRST_LAUNCH_DIALOG_SHOWN_KEY`. With the default surface
 * now `'terminal'`, this dialog only fires for users who actively opted into
 * the extension surface (real intent mismatch). Exported for `extension.ts`.
 *
 * Actions: "Install" opens the marketplace; "Switch to Terminal Mode" writes
 * the setting; dismissal leaves the setting but still sets the flag.
 */
export async function maybeShowFirstLaunchDialog(
    context: vscode.ExtensionContext,
): Promise<void> {
    const already = context.globalState.get<boolean>(FIRST_LAUNCH_DIALOG_SHOWN_KEY, false);
    if (already) {
        return;
    }
    const config = vscode.workspace.getConfiguration('demoBuilder.ai');
    const surface = config.get<Surface>('surface', 'terminal');
    if (surface !== 'extension') {
        // Default surface or explicit terminal — no recovery needed.
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
        'You\'ve chosen the Claude Code extension surface for AI prompts, but the ' +
        'Claude Code VS Code extension is not installed. Install it to continue, or ' +
        'switch to terminal mode.',
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
