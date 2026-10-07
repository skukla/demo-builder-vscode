/**
 * The shell command that opens the terminal agent's chat — Claude Code.
 *
 * The launch path (`commands/openInClaude`) owns the terminal; this owns what is
 * typed into it, so the CLI spelling lives beside the engine seam and nowhere else.
 *
 * | | Claude Code |
 * |---|---|
 * | prompt | `claude -- '<p>'` |
 * | resume | `--continue` (Claude scopes it to the directory) |
 * | earlier chats | `claude --resume` |
 * | `auto` permissions | `--permission-mode auto` |
 * | `full` permissions | `--dangerously-skip-permissions` |
 *
 * @module features/ai/engine/chatLaunch
 */

import type { TerminalLaunch } from './agentEngine';

/** `demoBuilder.ai.permissions`: how much the agent may do without asking. */
export type AgentPermissions = 'ask' | 'auto' | 'full';

const PERMISSION_FLAGS: Record<TerminalLaunch['command'], Record<AgentPermissions, string>> = {
    claude: { ask: '', auto: ' --permission-mode auto', full: ' --dangerously-skip-permissions' },
};

/** Where saved conversations are looked up. Handed in, so tests can say. */
export interface ConversationProbes {
    /** Claude Code: whether any transcript exists for this directory. */
    claudeHasConversation(cwd: string): boolean;
}

export interface ChatCommand {
    /** The line to send to the terminal. */
    line: string;
    /** Whether it continues an earlier conversation (which then needs re-homing). */
    resumed: boolean;
}

/**
 * POSIX-quote a value as one shell argument: wrap in single quotes and write an
 * embedded single quote as `'\''`. Safe for spaces, `$`, backticks and newlines.
 */
export function quoteForShell(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * The command that starts (or resumes) a chat, optionally running a prompt first.
 *
 * @param prompt - the text to run; `rehome` is applied to it only when resuming,
 *   because a resumed conversation does not re-read AGENTS.md
 * @param fresh - New Chat: never resume
 */
export function buildChatCommand(
    launch: TerminalLaunch,
    cwd: string,
    options: {
        prompt?: string;
        fresh: boolean;
        rehome: (prompt: string) => string;
        permissions: AgentPermissions;
    },
    probes: ConversationProbes,
): ChatCommand {
    const { prompt, fresh, rehome, permissions } = options;
    const binary = launch.command;
    // `claude --continue` with nothing to continue exits at once, leaving a dead tab.
    const resumed = !fresh && probes.claudeHasConversation(cwd);
    const resumeArgs = resumed ? ' --continue' : '';
    // `--` ends the options, so a prompt starting with a dash stays text.
    const promptFlag = '--';
    const text = prompt && resumed ? rehome(prompt) : prompt;
    const head = `${binary}${PERMISSION_FLAGS[binary][permissions]}${resumeArgs}`;
    const line = text ? `${head} ${promptFlag} ${quoteForShell(text)}` : head;
    return { line, resumed };
}

/**
 * The command that opens Claude Code's own list of earlier chats, or `undefined`
 * when this directory has none to show.
 */
export function buildPastChatPickerCommand(
    launch: TerminalLaunch,
    cwd: string,
    permissions: AgentPermissions,
    probes: ConversationProbes,
): string | undefined {
    const binary = launch.command;
    return probes.claudeHasConversation(cwd)
        ? `${binary}${PERMISSION_FLAGS[binary][permissions]} --resume`
        : undefined;
}
