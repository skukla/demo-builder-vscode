/**
 * The shell command that opens an agent's chat in a terminal — per engine.
 *
 * The launch path (`commands/openInClaude`) owns the terminal; this owns what is
 * typed into it, so the engine-specific spelling lives beside the engine seam and
 * nowhere else.
 *
 * | | Claude Code | Copilot CLI |
 * |---|---|---|
 * | prompt | `claude -- '<p>'` | `copilot -i '<p>'` |
 * | resume | `--continue` (Claude scopes it to the directory) | `--resume <id>` of the newest session in the directory |
 * | earlier chats | `claude --resume` | `copilot --resume` |
 * | `auto` permissions | `--permission-mode auto` | `--allow-all-tools` |
 * | `full` permissions | `--dangerously-skip-permissions` | `--allow-all` |
 *
 * @module features/ai/engine/chatLaunch
 */

import type { TerminalLaunch } from './agentEngine';

/** `demoBuilder.ai.permissions`: how much the agent may do without asking. */
export type AgentPermissions = 'ask' | 'auto' | 'full';

const PERMISSION_FLAGS: Record<TerminalLaunch['command'], Record<AgentPermissions, string>> = {
    claude: { ask: '', auto: ' --permission-mode auto', full: ' --dangerously-skip-permissions' },
    copilot: { ask: '', auto: ' --allow-all-tools', full: ' --allow-all' },
};

/** Where each engine's saved conversations are looked up. Handed in, so tests can say. */
export interface ConversationProbes {
    /** Claude Code: whether any transcript exists for this directory. */
    claudeHasConversation(cwd: string): boolean;
    /** Copilot CLI: the newest session that ran in this directory. */
    copilotLatestSession(cwd: string): string | undefined;
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
    let resumeArgs = '';
    let promptFlag: string;
    const binary = launch.command;
    if (binary === 'claude') {
        // `claude --continue` with nothing to continue exits at once, leaving a dead tab.
        if (!fresh && probes.claudeHasConversation(cwd)) resumeArgs = ' --continue';
        // `--` ends the options, so a prompt starting with a dash stays text.
        promptFlag = '--';
    } else {
        const session = fresh ? undefined : probes.copilotLatestSession(cwd);
        if (session) resumeArgs = ` --resume ${quoteForShell(session)}`;
        // `-i` starts the interactive chat AND runs the prompt; `-p` would exit after.
        promptFlag = '-i';
    }
    const resumed = resumeArgs !== '';
    const text = prompt && resumed ? rehome(prompt) : prompt;
    const head = `${binary}${PERMISSION_FLAGS[binary][permissions]}${resumeArgs}`;
    const line = text ? `${head} ${promptFlag} ${quoteForShell(text)}` : head;
    return { line, resumed };
}

/**
 * The command that opens the engine's own list of earlier chats, or `undefined`
 * when this directory has none to show.
 */
export function buildPastChatPickerCommand(
    launch: TerminalLaunch,
    cwd: string,
    permissions: AgentPermissions,
    probes: ConversationProbes,
): string | undefined {
    const binary = launch.command;
    const exists =
        binary === 'claude'
            ? probes.claudeHasConversation(cwd)
            : probes.copilotLatestSession(cwd) !== undefined;
    return exists ? `${binary}${PERMISSION_FLAGS[binary][permissions]} --resume` : undefined;
}
