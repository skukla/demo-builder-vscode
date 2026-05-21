import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import type { Project } from '@/types/base';

/**
 * Harness selection mode for the Open in Claude Code action.
 *
 * - `auto`: Use the Claude Code VS Code extension if installed; fall back to terminal.
 * - `extension`: Always launch via the Claude Code VS Code extension (errors if missing).
 * - `terminal`: Always launch `claude` in a VS Code integrated terminal.
 */
type HarnessMode = 'auto' | 'extension' | 'terminal';

/** Claude Code extension marketplace identifier. */
const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

/** URI handler exposed by the Claude Code extension (v2.1.72+). */
const CLAUDE_CODE_URI = 'vscode://anthropic.claude-code/open';

/** globalState key tracking whether the first-time "drag-to-sidebar" tip has been shown. */
const FIRST_TIP_KEY = 'demoBuilder.ai.firstClaudeOpenTipShown';

/** Terminal name displayed in the integrated terminals dropdown. */
const TERMINAL_NAME = 'Claude Code';

/**
 * OpenInClaudeCommand — opens the Claude Code (CLI) harness for the current project.
 *
 * Drives off the `demoBuilder.ai.harness` setting (Cycle B). Two launch pathways:
 *
 *   1. **URI launch** (`vscode://anthropic.claude-code/open`) when the Claude Code
 *      VS Code extension is installed. The URI handler opens Claude Code in the
 *      currently-focused VS Code window (verified in Phase 1 research) — since
 *      the user clicks our action from inside their own VS Code window, this
 *      is always the right target. The URI handler accepts only `prompt` and
 *      `session` query params; `path`/`cwd`/`folder` are NOT supported.
 *
 *   2. **Terminal launch** (`claude` in an integrated terminal scoped to
 *      `project.path`) when the extension is not installed or the user has
 *      overridden the setting to `terminal`.
 *
 * First successful URI launch shows a one-time drag-to-sidebar tip via globalState.
 * The globalState write happens BEFORE the `showInformationMessage` call so a
 * quick second invocation does not double-fire the tip.
 */
export class OpenInClaudeCommand extends BaseCommand {
    /**
     * Execute the Open in Claude Code action for the given (or current) project.
     *
     * @param project Optional project to scope the terminal cwd to. When omitted,
     *                falls back to `StateManager.getCurrentProject()`.
     */
    public async execute(project?: Project): Promise<void> {
        const target = project ?? (await this.stateManager.getCurrentProject() ?? undefined);

        const harness = this.getHarness();
        this.logger.info(`[Open in Claude] harness=${harness} project=${target?.name ?? '<none>'}`);

        const extensionInstalled = this.isClaudeCodeExtensionInstalled();
        this.logger.debug(
            `[Open in Claude] extension installed: ${extensionInstalled}`,
        );

        try {
            if (harness === 'terminal') {
                this.logger.info('[Open in Claude] launching via terminal (forced by harness setting)');
                await this.launchTerminal(target);
                return;
            }

            if (harness === 'extension') {
                if (!extensionInstalled) {
                    this.logger.warn('[Open in Claude] extension harness selected but Claude Code extension is not installed');
                    await vscode.window.showErrorMessage(
                        'Claude Code VS Code extension is not installed. Install it from the marketplace, ' +
                        'or change `demoBuilder.ai.harness` to `terminal` to launch in an integrated terminal.',
                    );
                    return;
                }
                this.logger.info('[Open in Claude] launching via extension URI handler (forced by harness setting)');
                await this.launchViaUri(target);
                return;
            }

            // harness === 'auto'
            if (extensionInstalled) {
                this.logger.info('[Open in Claude] launching via extension URI handler (auto-detected)');
                await this.launchViaUri(target);
            } else {
                this.logger.info('[Open in Claude] launching via terminal (extension not installed)');
                await this.launchTerminal(target);
            }
        } catch (error) {
            this.logger.error(
                `[Open in Claude] failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            await vscode.window.showErrorMessage(
                `Failed to open Claude Code: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /** Read the `demoBuilder.ai.harness` setting (defaults to `auto`). */
    private getHarness(): HarnessMode {
        const config = vscode.workspace.getConfiguration('demoBuilder.ai');
        return config.get<HarnessMode>('harness', 'auto');
    }

    /** Detect whether the Claude Code VS Code extension is installed. */
    private isClaudeCodeExtensionInstalled(): boolean {
        return vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID) !== undefined;
    }

    /** Launch Claude Code via the extension's documented URI handler. */
    private async launchViaUri(project: Project | undefined): Promise<void> {
        const opened = await vscode.env.openExternal(vscode.Uri.parse(CLAUDE_CODE_URI));
        if (!opened) {
            this.logger.warn('[Open in Claude] vscode.env.openExternal returned false');
            await vscode.window.showWarningMessage(
                'Could not open Claude Code via the extension. Try again, or set ' +
                '`demoBuilder.ai.harness` to `terminal`.',
            );
            return;
        }
        this.logger.info(`[Open in Claude] URI launch succeeded for ${project?.name ?? '<no project>'}`);
        await this.maybeShowFirstTip();
    }

    /**
     * Launch `claude` in a fresh integrated terminal scoped to `project.path`.
     * Errors when no usable project path is available.
     */
    private async launchTerminal(project: Project | undefined): Promise<void> {
        if (!project || !project.path) {
            this.logger.error('[Open in Claude] cannot launch terminal: project path missing');
            await vscode.window.showErrorMessage(
                'Cannot open Claude Code: no project directory is available.',
            );
            return;
        }

        const terminal = this.createTerminal(TERMINAL_NAME, project.path);
        terminal.show();
        terminal.sendText('claude');
        this.logger.info(`[Open in Claude] terminal launched for ${project.name} at ${project.path}`);
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
        // Mark as shown FIRST so concurrent calls don't double-fire.
        await this.context.globalState.update(FIRST_TIP_KEY, true);
        this.logger.debug('[Open in Claude] showing first-time drag-to-sidebar tip');
        // Fire and forget — we don't want to block on the user dismissing the toast.
        vscode.window.showInformationMessage(
            'Tip: You can drag the Claude Code panel to the sidebar to keep it visible while you work.',
            'Got it',
        );
    }
}
