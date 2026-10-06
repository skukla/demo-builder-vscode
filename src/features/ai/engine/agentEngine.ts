/**
 * Which AI agent Demo Builder is serving — the ONE place the agent is named.
 *
 * The extension was built around Claude Code, and the assumption spread: config
 * files, hook formats, the terminal it launches, the paths the readiness checks
 * read. A tooling policy now makes GitHub Copilot the primary agent while Claude
 * Code is retired, so both have to work (AI-12).
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

/** The engines Demo Builder can serve. `auto` resolves to one of the others. */
export type AgentEngine = 'claude-code' | 'copilot-cli' | 'copilot-vscode';

/** What the setting accepts, `auto` included. */
export type AgentEngineSetting = AgentEngine | 'auto';

/** Where an engine keeps the MCP config that applies to every project. */
export interface AgentEngineDescriptor {
    /** The engine's id, as the setting spells it. */
    id: AgentEngine;
    /** What the SC is told they are talking to ("Claude Code", "Copilot"). */
    displayName: string;
    /**
     * The user-level MCP config file, relative to the home directory, or undefined
     * when the engine has none (VS Code registers servers through the extension API
     * and the workspace file instead).
     */
    globalMcpConfigPath?: string;
    /** Which hook file format the engine reads. */
    hookFormat: 'claude' | 'copilot';
    /** How a chat is opened: a terminal command, or a VS Code chat surface. */
    launch: TerminalLaunch | { kind: 'vscode-chat' };
}

/** A chat that runs as a command-line tool in a VS Code terminal. */
export interface TerminalLaunch {
    kind: 'terminal';
    /** The binary on the PATH. */
    command: 'claude' | 'copilot';
    /** The terminal tab's name — also how a live chat is found again. */
    terminalName: string;
    /** Where the SC is sent when the command is missing. */
    installUrl: string;
}

const DESCRIPTORS: Record<AgentEngine, AgentEngineDescriptor> = {
    'claude-code': {
        id: 'claude-code',
        displayName: 'Claude Code',
        globalMcpConfigPath: '.claude.json',
        hookFormat: 'claude',
        launch: {
            kind: 'terminal',
            command: 'claude',
            terminalName: 'Claude Code',
            installUrl: 'https://claude.com/code',
        },
    },
    'copilot-cli': {
        id: 'copilot-cli',
        displayName: 'Copilot CLI',
        globalMcpConfigPath: '.copilot/mcp-config.json',
        hookFormat: 'copilot',
        launch: {
            kind: 'terminal',
            command: 'copilot',
            terminalName: 'Copilot',
            installUrl:
                'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli',
        },
    },
    'copilot-vscode': {
        id: 'copilot-vscode',
        displayName: 'Copilot',
        hookFormat: 'copilot',
        launch: { kind: 'vscode-chat' },
    },
};

/** Every engine's chat terminal name — a live chat of ANY engine counts as open. */
export const AGENT_TERMINAL_NAMES: string[] = Object.values(DESCRIPTORS).flatMap((d) =>
    d.launch.kind === 'terminal' ? [d.launch.terminalName] : [],
);

/** The engines that keep a user-level MCP config file, in the order they are written. */
export const FILE_BACKED_ENGINES: AgentEngine[] = ['claude-code', 'copilot-cli'];

/**
 * The user-level MCP config paths for the given engines, absolute.
 *
 * One list, so the writer, the post-update repair and the drift check cannot
 * disagree about which files exist. An engine that keeps no such file is skipped.
 */
export function globalMcpConfigPaths(engines: AgentEngine[] = FILE_BACKED_ENGINES): string[] {
    const home = os.homedir();
    return engines
        .map((engine) => describeEngine(engine).globalMcpConfigPath)
        .filter((relative): relative is string => relative !== undefined)
        .map((relative) => path.join(home, relative));
}

/** The descriptor for a resolved engine. */
export function describeEngine(engine: AgentEngine): AgentEngineDescriptor {
    return DESCRIPTORS[engine];
}

/** Which CLIs are on the PATH — the only evidence `auto` resolves from. */
export interface InstalledAgents {
    claudeCode: boolean;
    copilotCli: boolean;
}

/**
 * Resolve the engine to serve.
 *
 * An explicit setting always wins, including when that engine is not installed:
 * the SC said what they want, and a launch failure that names the missing CLI is
 * more use than silently talking to the other agent.
 *
 * `auto` prefers what is installed, and prefers Copilot when both are — it is the
 * agent colleagues are required to use, and Claude Code is being retired. With
 * neither installed it answers `copilot-vscode`, because VS Code's own agent needs
 * no CLI at all.
 *
 * @param setting - the value of `demoBuilder.ai.engine`
 * @param installed - which agent CLIs are present
 * @returns the engine every other surface should serve
 */
export function resolveEngine(
    setting: AgentEngineSetting | undefined,
    installed: InstalledAgents,
): AgentEngine {
    if (setting && setting !== 'auto') return setting;
    if (installed.copilotCli) return 'copilot-cli';
    if (installed.claudeCode) return 'claude-code';
    return 'copilot-vscode';
}
