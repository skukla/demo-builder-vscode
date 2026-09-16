/**
 * agentEngine — which agent Demo Builder is serving.
 *
 * The seam exists so the Claude Code assumptions cannot spread again (AI-9 step 03).
 * These assert what a caller is handed, not how the module is written.
 */

import {
    describeEngine,
    resolveEngine,
    type AgentEngine,
} from '@/features/ai/engine/agentEngine';

const BOTH = { claudeCode: true, copilotCli: true };
const NEITHER = { claudeCode: false, copilotCli: false };

describe('resolveEngine', () => {
    it.each<AgentEngine>(['claude-code', 'copilot-cli', 'copilot-vscode'])(
        'obeys an explicit %s even when that CLI is absent',
        (engine) => {
            expect(resolveEngine(engine, NEITHER)).toBe(engine);
        },
    );

    it('prefers Copilot when both CLIs are installed — it is the one colleagues must use', () => {
        expect(resolveEngine('auto', BOTH)).toBe('copilot-cli');
    });

    it('answers Claude Code when it is the only CLI installed', () => {
        expect(resolveEngine('auto', { claudeCode: true, copilotCli: false })).toBe('claude-code');
    });

    it("answers VS Code's own agent when no CLI is installed", () => {
        // The one engine that needs nothing on the PATH, so it is the honest default
        // for a machine that has neither.
        expect(resolveEngine('auto', NEITHER)).toBe('copilot-vscode');
        expect(resolveEngine(undefined, NEITHER)).toBe('copilot-vscode');
    });
});

describe('describeEngine', () => {
    it('gives Claude Code its own config file, hooks and terminal command', () => {
        expect(describeEngine('claude-code')).toStrictEqual({
            id: 'claude-code',
            displayName: 'Claude Code',
            globalMcpConfigPath: '.claude.json',
            hookFormat: 'claude',
            launch: { kind: 'terminal', command: 'claude' },
        });
    });

    it('gives Copilot CLI its own config file and command', () => {
        expect(describeEngine('copilot-cli')).toStrictEqual({
            id: 'copilot-cli',
            displayName: 'Copilot CLI',
            globalMcpConfigPath: '.copilot/mcp-config.json',
            hookFormat: 'copilot',
            launch: { kind: 'terminal', command: 'copilot' },
        });
    });

    it('gives Copilot in VS Code no global config file and a chat launch', () => {
        // VS Code takes its servers from the workspace file and from extensions, so
        // there is no user-level file for us to write.
        expect(describeEngine('copilot-vscode')).toStrictEqual({
            id: 'copilot-vscode',
            displayName: 'Copilot',
            hookFormat: 'copilot',
            launch: { kind: 'vscode-chat' },
        });
    });

    it('never answers a Claude hook format for a Copilot engine', () => {
        expect(describeEngine('copilot-cli').hookFormat).toBe('copilot');
        expect(describeEngine('copilot-vscode').hookFormat).toBe('copilot');
    });
});
