/**
 * Which AI agent Demo Builder is serving — the ONE place the agent is named.
 *
 * The extension was built around Claude Code, and the assumption spread: config
 * files, the terminal it launches, the paths the readiness checks read. A tooling
 * policy now makes GitHub Copilot the primary agent, so both have to work (AI-12).
 *
 * The rule this module exists to enforce: nothing outside this directory names an
 * engine. A caller asks for the descriptor and reads the field it needs. No test
 * enforces this yet — it is held by review, which is how the first set of
 * assumptions spread, so treat a new engine name outside this directory as a defect.
 *
 * @module features/ai/engine/agentEngine
 */

import * as os from 'os';
import * as path from 'path';

/**
 * The agents the Chat button can open.
 *
 * Copilot CLI was a third until 2026-10-06: same subscription and models as the
 * panel, so to an SC it was a technical choice they should not have to make
 * (owner). Its user-level MCP config is still written — see `GLOBAL_MCP_CONFIGS`.
 */
export type AgentEngine = 'claude-code' | 'copilot-vscode';

export interface AgentEngineDescriptor {
    /** The engine's id, as the setting spells it. */
    id: AgentEngine;
    /** What the SC is told they are talking to ("Claude Code", "Copilot"). */
    displayName: string;
    /** How a chat is opened: a terminal command, or a VS Code chat surface. */
    launch: TerminalLaunch | { kind: 'vscode-chat' };
}

/** A chat that runs as a command-line tool in a VS Code terminal. */
export interface TerminalLaunch {
    kind: 'terminal';
    /** The binary on the PATH. */
    command: 'claude';
    /** The terminal tab's name — also how a live chat is found again. */
    terminalName: string;
}

const DESCRIPTORS: Record<AgentEngine, AgentEngineDescriptor> = {
    'claude-code': {
        id: 'claude-code',
        displayName: 'Claude Code',
        launch: {
            kind: 'terminal',
            command: 'claude',
            terminalName: 'Claude Code',
        },
    },
    'copilot-vscode': {
        id: 'copilot-vscode',
        displayName: 'Copilot',
        launch: { kind: 'vscode-chat' },
    },
};

/** Every engine's chat terminal name — a live chat of ANY engine counts as open. */
export const AGENT_TERMINAL_NAMES: string[] = Object.values(DESCRIPTORS).flatMap((d) =>
    d.launch.kind === 'terminal' ? [d.launch.terminalName] : [],
);

/**
 * The agent CLIs whose user-level MCP config Demo Builder registers its server
 * in, relative to the home directory.
 *
 * Not the same list as the engines: an SC who runs `copilot` themselves should
 * find the tools there whether or not the Chat button opens it. VS Code's chat
 * keeps no such file — it takes servers from the workspace `.mcp.json`.
 */
export const GLOBAL_MCP_CONFIGS = {
    claude: '.claude.json',
    copilot: '.copilot/mcp-config.json',
} as const;

/** An agent CLI that keeps a user-level MCP config. */
export type GlobalMcpAgent = keyof typeof GLOBAL_MCP_CONFIGS;

/** Every agent in `GLOBAL_MCP_CONFIGS`, in the order they are written. */
export const GLOBAL_MCP_AGENTS = Object.keys(GLOBAL_MCP_CONFIGS) as GlobalMcpAgent[];

/**
 * The user-level MCP config paths for the given agents, absolute.
 *
 * One list, so the writer, the post-update repair and the drift check cannot
 * disagree about which files exist.
 */
export function globalMcpConfigPaths(agents: GlobalMcpAgent[] = GLOBAL_MCP_AGENTS): string[] {
    const home = os.homedir();
    return agents.map((agent) => path.join(home, GLOBAL_MCP_CONFIGS[agent]));
}

/** The descriptor for a resolved engine. */
export function describeEngine(engine: AgentEngine): AgentEngineDescriptor {
    return DESCRIPTORS[engine];
}

/** The shipped default of `demoBuilder.ai.engine` — package.json says the same. */
export const DEFAULT_ENGINE_SETTING: AgentEngine = 'copilot-vscode';

/**
 * Resolve the engine to serve from the value of `demoBuilder.ai.engine`.
 *
 * Anything but `claude-code` is the default, Copilot in VS Code — including the
 * values earlier betas accepted (`copilot-cli`, `auto`), which can still sit in
 * an SC's settings.json. An explicit `claude-code` wins even when the CLI is
 * missing: the launch then says what is missing rather than opening another agent.
 *
 * @param setting - the raw setting value
 */
export function resolveEngine(setting: unknown): AgentEngine {
    return setting === 'claude-code' ? 'claude-code' : DEFAULT_ENGINE_SETTING;
}
