/** Terminal prompt delivery: spawn launch-arg, reuse bracketed-paste, clipboard handoff — split from openInClaude.test.ts. */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import { OpenInClaudeCommand, REHOME_PROMPT_PREFIX } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Terminal + prompt: clipboard handoff
    // ------------------------------------------------------------------------

    describe('terminal mode + prompt: clipboard handoff', () => {
        it('writes the prompt to the clipboard before launching the terminal', async () => {
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            expect(mocks.clipboardWriteMock).toHaveBeenCalledWith('do the thing');
        });

        it('shows the soft "prompt sent + clipboard fallback" tip on first terminal-mode prompt click', async () => {
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            // Find the clipboard-fallback tip — references sending to Claude AND mentions clipboard fallback
            const tipCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                /clipboard/i.test(String(c[0])) && /sent to claude/i.test(String(c[0])),
            );
            expect(tipCall).toBeDefined();
        });

        it('does NOT write clipboard when no prompt is provided', async () => {
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.clipboardWriteMock).not.toHaveBeenCalled();
        });
    });

    // ------------------------------------------------------------------------
    // Spawn case: prompt delivered as a launch argument. Race-free — no
    // waiting for the REPL to be ready, no bracketed-paste. Includes
    // `--continue` only when a prior session exists for the cwd, so a
    // fresh project does not error with "No conversation found to continue".
    // ------------------------------------------------------------------------

    describe('spawn case: prompt delivered as a launch argument', () => {
        it('launches with `--continue` and the prompt when a prior conversation exists', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            // Continued conversation → carries the re-home preamble before the prompt.
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith(
                `claude --continue -- '${REHOME_PROMPT_PREFIX}do the thing'`,
            );
        });

        it('omits `--continue` on cold start and submits the prompt to a fresh session', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            // Cold start self-homes from AGENTS.md → NO re-home preamble.
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith("claude -- 'do the thing'");
            expect(mocks.terminalSendTextMock.mock.calls[0][0]).not.toContain(REHOME_PROMPT_PREFIX);
        });

        it('escapes single quotes in the prompt so the shell receives it intact', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: "it's a test" });

            // POSIX single-quote escaping: ' becomes '\'' (close, escaped quote, reopen).
            // The re-home preamble (no quotes) precedes the prompt inside the same arg.
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith(
                `claude --continue -- '${REHOME_PROMPT_PREFIX}it'\\''s a test'`,
            );
        });

        it('keeps a multi-line prompt inside the single-quoted argument', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: true });
            const multiLine = 'line one\nline two';
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: multiLine });

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith(
                `claude --continue -- '${REHOME_PROMPT_PREFIX}${multiLine}'`,
            );
        });

        it('does NOT bracketed-paste inject on spawn (the prompt rides the launch arg)', async () => {
            setupVscodeMocks();
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();
        });

        it('spawns with bare `claude` on cold start when no prompt is provided', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });

        it('spawns with `claude --continue` when a prior conversation exists and no prompt', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });
    });

    // ------------------------------------------------------------------------
    // Reuse case: claude is already at its REPL, so inject via bracketed paste
    // (CSI 200~/201~) immediately. A running session can't take a new launch
    // arg, so reuse pre-fills the input for the user to send.
    // ------------------------------------------------------------------------

    describe('reuse case: bracketed-paste injection', () => {
        const PASTE_START = '\x1b[200~';
        const PASTE_END = '\x1b[201~';
        const CLIPBOARD_TIP_KEY = 'demoBuilder.ai.clipboardFallbackTipShown';

        it('injects the prompt via sendSequence immediately when a live terminal exists', async () => {
            const mocks = setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'hello world' });

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeDefined();
            const payload = sendSequenceCall![1] as { text: string };
            // Reuse = continued session → re-home preamble precedes the prompt.
            expect(payload.text).toBe(PASTE_START + REHOME_PROMPT_PREFIX + 'hello world' + PASTE_END);
            // No spawn — createTerminal not called
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('multi-line prompt: bracketed-paste markers wrap the whole block (including newlines)', async () => {
            setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const multiLine = 'line one\nline two\nline three';
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: multiLine });

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeDefined();
            const payload = sendSequenceCall![1] as { text: string };
            // Whole multi-line block is wrapped — newlines stay inside the brackets
            expect(payload.text).toBe(PASTE_START + REHOME_PROMPT_PREFIX + multiLine + PASTE_END);
            // Verify newlines were preserved (not stripped)
            expect(payload.text).toContain('\n');
        });

        it('clipboard-fallback tip fires once-ever (gated by globalState flag)', async () => {
            const mocks = setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'first' });

            // First click — tip shown, flag set
            const firstTipCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                /sent to claude/i.test(String(c[0])),
            );
            expect(firstTipCalls.length).toBe(1);
            expect(globalState.update).toHaveBeenCalledWith(CLIPBOARD_TIP_KEY, true);

            // Second click — flag already set, tip should NOT fire again
            mocks.showInformationMessageMock.mockClear();
            (globalState.get as jest.Mock).mockImplementation((key: string, fallback?: unknown) => {
                if (key === CLIPBOARD_TIP_KEY) return true;
                return fallback;
            });
            await command.execute({ project: makeProject() as Project, prompt: 'second' });
            const secondTipCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                /sent to claude/i.test(String(c[0])),
            );
            expect(secondTipCalls.length).toBe(0);
        });

        it('does NOT inject anything when no prompt is provided', async () => {
            setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();
        });
    });
});
