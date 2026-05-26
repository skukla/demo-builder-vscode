/** Terminal prompt handling: clipboard handoff + bracketed-paste injection — split from openInClaude.test.ts. */
import * as vscode from 'vscode';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
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
        // Spawn-case prompt clicks schedule a setTimeout for bracketed-paste
        // injection. Use fake timers so the timer doesn't leak past the test.
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        });

        it('writes the prompt to the clipboard before launching the terminal', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'do the thing' });

            expect(mocks.clipboardWriteMock).toHaveBeenCalledWith('do the thing');
        });

        it('shows the soft "prompt sent + clipboard fallback" tip on first terminal-mode prompt click', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
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
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
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
    // Bracketed-paste injection (reuse + spawn) + clipboard-fallback tip
    // ------------------------------------------------------------------------

    describe('bracketed-paste prompt injection', () => {
        const PASTE_START = '[200~';
        const PASTE_END = '[201~';
        const CLIPBOARD_TIP_KEY = 'demoBuilder.ai.clipboardFallbackTipShown';
        const DEFAULT_SPAWN_INJECT_DELAY_MS = 2500;

        // The spawn-case uses setTimeout for the delayed inject. Fake timers
        // let us advance time deterministically without leaking real timers.
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.runOnlyPendingTimers();
            jest.useRealTimers();
        });

        it('reuse case: injects the prompt via sendSequence immediately (no setTimeout)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
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
            expect(payload.text).toBe(PASTE_START + 'hello world' + PASTE_END);
            // No spawn — createTerminal not called
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('spawn case: injects after the default delay (~2.5s), and not at the old 800ms point', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );
            const findInject = () => executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );

            await command.execute({ project: makeProject() as Project, prompt: 'spawn-time prompt' });

            // Not fired immediately — the inject is scheduled.
            expect(findInject()).toBeUndefined();

            // The old 800ms point is now too early: claude --continue is still
            // bootstrapping, so the inject must NOT have fired yet.
            jest.advanceTimersByTime(800);
            expect(findInject()).toBeUndefined();

            // Fires once the full default delay elapses.
            jest.advanceTimersByTime(DEFAULT_SPAWN_INJECT_DELAY_MS - 800);
            const call = findInject();
            expect(call).toBeDefined();
            const payload = call![1] as { text: string };
            expect(payload.text).toBe(PASTE_START + 'spawn-time prompt' + PASTE_END);
        });

        it('spawn case: honors a configured spawnInjectDelayMs override', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                spawnInjectDelayMs: 1200,
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );
            const findInject = () => executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );

            await command.execute({ project: makeProject() as Project, prompt: 'configured prompt' });

            // Nothing fires before the configured delay elapses.
            jest.advanceTimersByTime(1199);
            expect(findInject()).toBeUndefined();

            // Fires exactly at the configured delay.
            jest.advanceTimersByTime(1);
            expect(findInject()).toBeDefined();
        });

        it('spawn case: skips inject if the terminal has exited before the delay fires', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project, prompt: 'spawn prompt' });

            // Simulate the terminal exiting (kill -9 / window close / whatever)
            const spawnedTerminal = mocks.createTerminalMock.mock.results[0]?.value as {
                exitStatus?: unknown;
            };
            spawnedTerminal.exitStatus = { code: 0 };

            // Advance past the delay — inject should be skipped
            jest.advanceTimersByTime(DEFAULT_SPAWN_INJECT_DELAY_MS);

            const sendSequenceCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.action.terminal.sendSequence',
            );
            expect(sendSequenceCall).toBeUndefined();
        });

        it('multi-line prompt: bracketed-paste markers wrap the whole block (including newlines)', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
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
            expect(payload.text).toBe(PASTE_START + multiLine + PASTE_END);
            // Verify newlines were preserved (not stripped)
            expect(payload.text).toContain('\n');
        });

        it('clipboard-fallback tip fires once-ever (gated by globalState flag)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
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
                surface: 'terminal',
                extensionInstalled: false,
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
