import * as vscode from 'vscode';
import { hasConversation as hasClaudeConversation } from './claudeSessionStore';
import { BaseCommand } from '@/core/base/baseCommand';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import { resolveActiveEngine } from '@/features/ai/engine/activeEngine';
import type { CommandProbe } from '@/features/ai/engine/agentCli';
import {
    AGENT_TERMINAL_NAMES,
    type AgentEngine,
    type AgentEngineDescriptor,
    type TerminalLaunch,
} from '@/features/ai/engine/agentEngine';
import {
    buildChatCommand,
    buildPastChatPickerCommand,
    type ConversationProbes,
} from '@/features/ai/engine/chatLaunch';
import { latestCopilotSession } from '@/features/ai/engine/copilotSessionStore';
import { refreshHomeAgentsMd } from '@/features/project-creation/services/aiBundle/homeAiContextWriter';
import { sanitizeTemplateValue } from '@/features/project-creation/services/sanitization';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/**
 * The AI engine — which agent Demo Builder launches.
 *
 * Defined by the engine seam (`features/ai/engine/agentEngine`), which is the one
 * place an engine is named. Re-exported here for the launch path's existing
 * callers.
 */
export type Engine = AgentEngine;

/**
 * globalState key tracking whether the soft "prompt sent; clipboard
 * fallback available" tip has been shown. Fires once-ever on the first prompt
 * click so the user learns the contract (auto-insert with clipboard fallback)
 * without repeated noise.
 */
const CLIPBOARD_FALLBACK_TIP_SHOWN_KEY = 'demoBuilder.ai.clipboardFallbackTipShown';

/** The one action on the not-installed message. */
const HOW_TO_INSTALL = 'How to install';

/**
 * Find a live agent chat terminal, if one is open. "Live" means a terminal whose
 * name matches and whose `exitStatus` is `undefined` (the shell is still
 * running). Shared by the launch reuse path and the `isClaudeChatOpen` state
 * check so the matching logic lives in one place.
 *
 * @param names - the terminal names to accept; every engine's by default
 */
export function findLiveClaudeTerminal(
    names: string[] = AGENT_TERMINAL_NAMES,
): vscode.Terminal | undefined {
    return vscode.window.terminals.find(
        (t) => names.includes(t.name) && t.exitStatus === undefined,
    );
}

/**
 * Whether a live agent chat terminal — of any engine — is currently open. Backs
 * the state-aware AI icon: when no chat is open the AI menu launches the chat
 * directly instead of showing the prompt QuickPick.
 */
export function isClaudeChatOpen(): boolean {
    return findLiveClaudeTerminal() !== undefined;
}

/** Where each engine's earlier conversations are found. */
const CONVERSATION_PROBES: ConversationProbes = {
    claudeHasConversation: hasClaudeConversation,
    copilotLatestSession: latestCopilotSession,
};

/**
 * Argument shape accepted by `OpenInClaudeCommand.execute`. Supports the legacy
 * positional `Project` arg for backwards compatibility and the
 * `{ project?, prompt? }` payload.
 */
export type OpenInClaudeArg =
    | Project
    | { project?: Project; prompt?: string; fresh?: boolean; pickPast?: boolean };

/** Said when the SC asks to pick an earlier chat and none exist yet. */
const NO_EARLIER_CHATS = 'There are no earlier chats to pick from yet.';

/**
 * Re-home preamble prepended to a prompt delivered into a CONTINUED conversation
 * (terminal reuse, or a spawn that resumes via `--continue`). A resumed
 * conversation doesn't re-read the home `AGENTS.md`, so it can keep stale
 * "current project" context.
 *
 * **This is the path that actually runs.** `hasClaudeConversation` is true as soon
 * as the projects root has ONE transcript, so after a user's first ever chat every
 * launch resumes — which means the `AGENTS.md` statement written by
 * `refreshHomeAgentsMd` reaches only cold starts and headless `claude -p` runs.
 * Removing the orientation round trip for real users has to happen HERE.
 *
 * So state the project rather than ordering a call to discover it, for the same
 * reason the home `AGENTS.md` does. The staleness objection that forces
 * `AGENTS.md` to stay silent at activation does not apply: this string is rebuilt
 * on every single launch from a pointer read moments earlier, so it cannot go
 * stale in the way a once-per-activation file can.
 *
 * With no resolvable project the original wording is kept verbatim — the agent is
 * told to resolve the project itself, which is correct when we do not know it.
 */
export function buildRehomePrefix(currentProjectName?: string): string {
    if (!currentProjectName) {
        return (
            'Before responding, call the get_current_project tool to re-confirm the active demo ' +
            'project (it may have changed since this conversation started), then address the ' +
            'request below.\n\n'
        );
    }
    // Strip characters that would break out of the single line we are prepending
    // to the user's prompt; the same helper every other interpolated project value
    // goes through.
    const name = sanitizeTemplateValue(currentProjectName);
    return (
        `The active demo project is now "${name}" — it may have changed since this ` +
        'conversation started, so use that and do NOT call get_current_project to ' +
        'confirm it. Address the request below.\n\n'
    );
}

/**
 * OpenInClaudeCommand — opens the SC's agent chat. Which agent is decided by the
 * engine seam (`demoBuilder.ai.engine`, AI-12): Claude Code or Copilot CLI run in a
 * VS Code integrated terminal placed as a tab in the active editor group (next to
 * Project Dashboard); Copilot in VS Code opens VS Code's own chat in agent mode.
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
    /**
     * @param cliProbe - the extension's command executor (its `commandExists`),
     *   asked which agent CLIs are installed before anything is typed into a terminal
     */
    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        logger: Logger,
        private readonly cliProbe: CommandProbe,
    ) {
        super(context, stateManager, logger);
    }

    public async execute(arg?: OpenInClaudeArg): Promise<void> {
        const { descriptor, installed } = await resolveActiveEngine(this.cliProbe);
        // Without the CLI the terminal would only say `command not found`. Say what
        // is missing instead, and open nothing (AI-4a — the field report).
        if (!installed && descriptor.launch.kind === 'terminal') {
            await this.explainMissingCli(descriptor.displayName, descriptor.launch);
            return;
        }

        // Only the prompt matters now — any project arg is ignored. The home Chat
        // always launches at the projects root so one session addresses any
        // project by name via the in-extension MCP tools.
        const { prompt, fresh, pickPast } = normalizeArg(arg);
        const cwd = resolveProjectsRoot();

        this.logger.info(
            `[Open in Claude] engine=${descriptor.id} cwd=${cwd} prompt=${prompt ? 'yes' : 'no'} fresh=${fresh ? 'yes' : 'no'}`,
        );

        // Resolve the active project ONCE and use it for both deliveries of the
        // same fact: the home AGENTS.md (read only by cold starts) and the
        // re-home preamble (read by every resumed conversation, which after a
        // user's first ever chat is all of them). Either way the agent is told
        // which project it is on instead of spending a round trip asking.
        const currentProjectName = await this.resolveCurrentProjectName();
        await refreshHomeAgentsMd(cwd, currentProjectName);

        try {
            const { launch } = descriptor;
            if (launch.kind === 'vscode-chat') {
                await this.openVsCodeChat(prompt, currentProjectName, fresh, pickPast);
            } else if (pickPast) {
                await this.launchPastChatPicker(launch, cwd);
            } else {
                await this.launchTerminal(
                    descriptor,
                    launch,
                    cwd,
                    prompt,
                    currentProjectName,
                    fresh,
                );
            }
        } catch (error) {
            this.logger.error(
                `[Open in Claude] failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            await vscode.window.showErrorMessage(
                `Failed to open ${descriptor.displayName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /**
     * Copilot in VS Code: open VS Code's own chat in agent mode, the prompt already
     * in it and run. That chat cannot be resumed by command, so a prompt always
     * carries the re-home preamble — the chat may be a long-running one.
     *
     * New Chat starts a new chat session first; "pick an earlier chat" opens VS
     * Code's agent sessions list, which is VS Code's, not ours.
     */
    private async openVsCodeChat(
        prompt: string | undefined,
        currentProjectName: string | undefined,
        fresh: boolean,
        pickPast: boolean,
    ): Promise<void> {
        if (pickPast) {
            await vscode.commands.executeCommand('workbench.action.chat.focusAgentSessionsViewer');
            this.logger.info('[Open in Claude] opened VS Code\'s agent sessions list');
            return;
        }
        if (fresh) {
            await vscode.commands.executeCommand('workbench.action.chat.newChat');
        }
        const query = prompt ? buildRehomePrefix(currentProjectName) + prompt : undefined;
        await vscode.commands.executeCommand(
            'workbench.action.chat.open',
            query ? { mode: 'agent', query, isPartialQuery: false } : { mode: 'agent' },
        );
        this.logger.info(
            `[Open in Claude] VS Code chat opened (agent mode, prompt=${prompt ? 'yes' : 'no'}, fresh=${fresh ? 'yes' : 'no'})`,
        );
    }

    /**
     * Open the agent's own session picker (`claude --resume` / `copilot --resume`
     * with no value) so the SC can return to an EARLIER conversation, not just the
     * most recent one a plain launch lands on (AI-4b).
     *
     * The list is the agent's, not ours: it owns the transcript format, so a
     * second session list here would be a second thing to keep correct. No prompt
     * rides along — the SC is choosing where to go, and whether `--resume`
     * delivers a launch-argument prompt into the session picked afterwards is
     * unverified. Like New Chat, the running chat terminal is retired first and
     * a new process started; nothing is pasted into a live REPL, so there is no
     * timing to race.
     *
     * With no transcript at all the picker has nothing to show, so say that and
     * leave the running terminal alone.
     */
    private async launchPastChatPicker(launch: TerminalLaunch, cwd: string): Promise<void> {
        const command = buildPastChatPickerCommand(launch, cwd, CONVERSATION_PROBES);
        if (!command) {
            this.logger.info('[Open in Claude] pick an earlier chat: none exist yet');
            await vscode.window.showInformationMessage(NO_EARLIER_CHATS);
            return;
        }
        findLiveClaudeTerminal()?.dispose();
        const terminal = this.createTerminal(launch.terminalName, cwd, {
            viewColumn: vscode.ViewColumn.Active,
        });
        terminal.show();
        terminal.sendText(command);
        this.logger.info(`[Open in Claude] opened the earlier-chat picker (${command})`);
    }

    /** Tell the user the agent's CLI is not installed, and offer the install page. */
    private async explainMissingCli(displayName: string, launch: TerminalLaunch): Promise<void> {
        this.logger.warn(
            `[Open in Claude] \`${launch.command}\` not found — the chat was not opened`,
        );
        const choice = await vscode.window.showWarningMessage(
            `${displayName} (the command-line tool) is not installed, so the chat cannot open. ` +
                'Install it, then try again.',
            HOW_TO_INSTALL,
        );
        if (choice === HOW_TO_INSTALL) {
            await vscode.env.openExternal(vscode.Uri.parse(launch.installUrl));
        }
    }

    /**
     * The current-project pointer's name, or `undefined` when it cannot be read.
     *
     * Never blocks the launch: no pointer, or a read that throws, falls through
     * to `undefined`, and both consumers then keep their original "resolve it
     * yourself" wording. Naming the project is an optimisation; naming the WRONG
     * one would not be, so an unreadable pointer must produce no claim rather
     * than a stale one.
     */
    private async resolveCurrentProjectName(): Promise<string | undefined> {
        try {
            return (await this.stateManager.getCurrentProject())?.name;
        } catch (error) {
            this.logger.debug(
                `[Open in Claude] could not resolve current project: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return undefined;
        }
    }

    /**
     * Launch the agent CLI in an integrated terminal at `cwd`, reusing that
     * engine's terminal ("Claude Code", "Copilot") if one is still alive. What is
     * typed comes from `buildChatCommand`, beside the engine seam.
     *
     * When `prompt` is provided, delivery depends on spawn vs reuse:
     *   - Spawn: pass the prompt to the CLI (`claude --continue -- <prompt>`,
     *     `copilot --resume <id> -i <prompt>`) as a launch argument. Race-free — claude receives it the moment it starts, with
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
    private async launchTerminal(
        descriptor: AgentEngineDescriptor,
        launch: TerminalLaunch,
        cwd: string,
        prompt: string | undefined,
        currentProjectName: string | undefined,
        fresh: boolean,
    ): Promise<void> {
        if (!cwd) {
            this.logger.error('[Open in Claude] cannot launch terminal: cwd missing');
            await vscode.window.showErrorMessage(
                `Cannot open ${descriptor.displayName}: no directory is available.`,
            );
            return;
        }

        // Clipboard fallback — always write so the user has a safety net.
        // Silent unless the one-time tip toast hasn't yet shown.
        if (prompt) {
            await vscode.env.clipboard.writeText(prompt);
            this.logger.debug('[Open in Claude] prompt copied to clipboard (silent fallback)');
        }

        // Only this engine's terminal: pasting into another agent's chat would hand
        // the prompt to the agent the SC did not choose.
        const live = findLiveClaudeTerminal([launch.terminalName]);

        if (fresh) {
            // New Chat: retire the running conversation's terminal and fall
            // through to the spawn path below, which starts a NEW process — the
            // only way AGENTS.md is read again. The tab is recreated immediately
            // with the same name in the same editor group, so what the user sees
            // is the Claude Code tab restarting in place.
            //
            // Reusing the PROCESS was considered and rejected: `/exit` followed
            // by a relaunch needs to know when the REPL has gone and the shell is
            // listening, and there is no signal for that — the same race that
            // defeated timed sends into this terminal twice before.
            //
            // The old conversation is not destroyed; it stays in Claude Code's
            // session store and `claude --resume` still reaches it. It simply
            // stops being what `--continue` lands on.
            live?.dispose();
            this.logger.info('[Open in Claude] starting a NEW conversation (terminal restarted)');
        } else if (live) {
            live.show();
            this.logger.info('[Open in Claude] terminal reused');
            if (prompt) {
                // Reuse case: claude is already at its REPL (a CONTINUED conversation)
                // — re-home it to the active project, then inject the prompt.
                this.injectPromptViaBracketedPaste(buildRehomePrefix(currentProjectName) + prompt);
                this.maybeShowClipboardFallbackTip(descriptor.displayName);
            }
            return;
        }

        // Chat-first: open the terminal as a tab in the active editor group
        // (next to Project Dashboard), not a side split.
        const terminal = this.createTerminal(launch.terminalName, cwd, {
            viewColumn: vscode.ViewColumn.Active,
        });
        terminal.show();
        // Deliver the prompt as a launch argument so the CLI runs it on startup —
        // no waiting for the REPL, no dropped paste.
        //
        // Resume only when this directory has an earlier conversation: a resume
        // with nothing to resume leaves a dead tab. `fresh` overrides it outright —
        // a New Chat that resumed would be a new tab wearing the old
        // conversation's context, the one thing it must not be. A resumed
        // conversation won't re-read AGENTS.md, so its prompt carries the re-home
        // preamble; a cold start self-homes from AGENTS.md.
        const { line, resumed } = buildChatCommand(
            launch,
            cwd,
            {
                prompt,
                fresh,
                rehome: (text) => buildRehomePrefix(currentProjectName) + text,
            },
            CONVERSATION_PROBES,
        );
        terminal.sendText(line);
        this.logger.info(
            `[Open in Claude] terminal spawned (engine=${descriptor.id}, location=editor-active, prompt=${prompt ? 'yes' : 'no'}, resume=${resumed ? 'yes' : 'no'})`,
        );

        if (prompt) {
            this.maybeShowClipboardFallbackTip(descriptor.displayName);
        }
    }

    /**
     * Inject the prompt into the active terminal via bracketed-paste escape
     * sequences (CSI 200~ / CSI 201~). Bracketed-paste tells the receiving
     * REPL (claude ≥ 2.1.108, copilot) that the input is pasted content — preserves
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
     * Show the soft "prompt sent; clipboard fallback available" tip once-ever
     * so the user learns the contract without repeated notifications. Flag is
     * set BEFORE the toast shows (race-safe).
     */
    private maybeShowClipboardFallbackTip(displayName: string): void {
        const already = this.context.globalState.get<boolean>(
            CLIPBOARD_FALLBACK_TIP_SHOWN_KEY,
            false,
        );
        if (already) return;
        void this.context.globalState.update(CLIPBOARD_FALLBACK_TIP_SHOWN_KEY, true);
        void vscode.window.showInformationMessage(
            `Prompt sent to ${displayName}. Also on your clipboard if you need to paste.`,
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

    // No demoBuilder.ai.surface / dockToRight clears any more: those settings
    // were removed from package.json in 7bbe1bd9, and VS Code REJECTS
    // `update()` on an unregistered key — so the two clears this block used
    // to attempt could only throw, aborting this function before the
    // claudeCode cleanup below ever ran (callers swallow the rejection with
    // a warn). Stale values in a user's settings.json are inert — VS Code
    // ignores unregistered keys — so there is nothing to clean and no API
    // that could clean it. Found by the manifest-mirrors settings check,
    // 2026-08-21.

    // Clear any `claudeCode.preferredLocation` value Demo Builder wrote in
    // earlier versions; with the extension surface retired we no longer touch
    // it, but existing users may still carry our prior write.
    const claudeConfig = vscode.workspace.getConfiguration('claudeCode');
    await claudeConfig.update('preferredLocation', undefined, vscode.ConfigurationTarget.Global);
}

/**
 * Read the three fields `execute` acts on out of the polymorphic argument.
 *
 * Accepts `undefined`, a `{ prompt?, fresh? }` payload, or a `Project` passed
 * positionally (the legacy form). The legacy case needs no branch of its own: a
 * `Project` carries neither `prompt` nor `fresh`, so reading them off one yields
 * exactly what the separate branch used to return. It also used to return the
 * `project`, which no caller has read since the home Chat stopped anchoring to a
 * project — four mutants sat on that branch and none of them changed anything.
 */
function normalizeArg(arg: OpenInClaudeArg | undefined): {
    prompt: string | undefined;
    fresh: boolean;
    pickPast: boolean;
} {
    const payload = arg as { prompt?: string; fresh?: boolean; pickPast?: boolean } | undefined;
    return {
        prompt: payload?.prompt,
        fresh: payload?.fresh === true,
        pickPast: payload?.pickPast === true,
    };
}
