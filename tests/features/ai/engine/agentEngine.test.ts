/**
 * agentEngine — which agent Demo Builder is serving.
 *
 * The seam exists so the Claude Code assumptions cannot spread again (AI-12 step 03).
 * These assert what a caller is handed, not how the module is written.
 */

import * as os from 'os';
import * as path from 'path';
import {
    describeEngine,
    globalMcpConfigPaths,
    resolveEngine,
} from '@/features/ai/engine/agentEngine';

describe('resolveEngine', () => {
    it('obeys an explicit claude-code', () => {
        expect(resolveEngine('claude-code')).toBe('claude-code');
    });

    it("defaults to VS Code's own chat", () => {
        // The panel is the experience Demo Builder promotes (owner, 2026-10-06).
        expect(resolveEngine(undefined)).toBe('copilot-vscode');
        expect(resolveEngine('copilot-vscode')).toBe('copilot-vscode');
    });

    it.each(['copilot-cli', 'auto', 'something-else', 42])(
        'answers the default for %p — a value an earlier beta accepted, or none we know',
        (stale) => {
            // An SC's settings.json can still hold these; the Chat button must work.
            expect(resolveEngine(stale)).toBe('copilot-vscode');
        },
    );
});

describe('describeEngine', () => {
    it('gives Claude Code its terminal command', () => {
        expect(describeEngine('claude-code')).toStrictEqual({
            id: 'claude-code',
            displayName: 'Claude Code',
            launch: {
                kind: 'terminal',
                command: 'claude',
                terminalName: 'Claude Code',
            },
        });
    });

    it('gives Copilot in VS Code a chat launch', () => {
        expect(describeEngine('copilot-vscode')).toStrictEqual({
            id: 'copilot-vscode',
            displayName: 'Copilot',
            launch: { kind: 'vscode-chat' },
        });
    });
});

describe('globalMcpConfigPaths', () => {
    it("names both agent CLIs' user configs — Copilot CLI too, though Chat no longer opens it", () => {
        expect(globalMcpConfigPaths()).toEqual([
            path.join(os.homedir(), '.claude.json'),
            path.join(os.homedir(), '.copilot/mcp-config.json'),
        ]);
    });

    it('names only the agents asked for', () => {
        expect(globalMcpConfigPaths(['copilot'])).toEqual([
            path.join(os.homedir(), '.copilot/mcp-config.json'),
        ]);
    });
});
