/** Terminal surface: forced launch, find-or-spawn, location selection, terminal behavior — split from openInClaude.test.ts. */
import * as vscode from 'vscode';
import { OpenInClaudeCommand, isClaudeChatOpen } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Surface=terminal
    // ------------------------------------------------------------------------

    describe("surface='terminal'", () => {
        it('forces terminal launch when extension is NOT installed', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('uses `claude --continue` instead of plain `claude`', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
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
    // Terminal find-or-spawn
    // ------------------------------------------------------------------------

    describe('terminal find-or-spawn', () => {
        it('reuses an existing live "Claude Code" terminal instead of spawning a new one', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Did NOT spawn a new terminal
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            // Focused the existing one
            expect(mocks.existingTerminalShowMocks[0]).toHaveBeenCalled();
            // Did NOT re-run claude in the existing terminal
            expect(mocks.terminalSendTextMock).not.toHaveBeenCalled();
        });

        it('spawns a new terminal if the only matching terminal has exited', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: { code: 0 } }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });

        it('ignores terminals with non-matching names', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'bash', exitStatus: undefined }, { name: 'zsh', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });
    });

    // ------------------------------------------------------------------------
    // launchTerminal location selection — chat-first: always an editor tab in
    // the active group (ViewColumn.Active), decoupled from dockToRight.
    // ------------------------------------------------------------------------

    describe('launchTerminal location selection', () => {
        it('opens the terminal as a tab in the active editor group (ViewColumn.Active) when dockToRight=false', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                dockToRight: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg).toMatchObject({
                name: 'Claude Code',
                cwd: '/projects/demo',
                location: { viewColumn: vscode.ViewColumn.Active },
            });
        });

        it('still uses ViewColumn.Active even when dockToRight=true (no longer a side split)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                dockToRight: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg.location).toEqual({ viewColumn: vscode.ViewColumn.Active });
        });
    });

    // ------------------------------------------------------------------------
    // isClaudeChatOpen() — true iff a live "Claude Code" terminal exists
    // (exitStatus undefined). Backs the state-aware AI icon in aiMenu.
    // ------------------------------------------------------------------------

    describe('isClaudeChatOpen()', () => {
        it('returns true when a live "Claude Code" terminal exists', () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });

            expect(isClaudeChatOpen()).toBe(true);
        });

        it('returns false when the only "Claude Code" terminal has exited', () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: { code: 0 } }],
            });

            expect(isClaudeChatOpen()).toBe(false);
        });

        it('returns false when no terminals are open', () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [],
            });

            expect(isClaudeChatOpen()).toBe(false);
        });

        it('ignores live terminals with non-matching names', () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'bash', exitStatus: undefined }],
            });

            expect(isClaudeChatOpen()).toBe(false);
        });
    });

    // ------------------------------------------------------------------------
    // Terminal behavior
    // ------------------------------------------------------------------------

    describe('terminal behavior', () => {
        it("creates a terminal named 'Claude Code' with cwd = project.path", async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ path: '/projects/demo' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                makeLogger() as never,
            );

            await command.execute(project as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg).toMatchObject({ name: 'Claude Code', cwd: '/projects/demo' });
        });

        it('calls term.show() before sendText("claude --continue")', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const showOrder = mocks.terminalShowMock.mock.invocationCallOrder[0];
            const sendOrder = mocks.terminalSendTextMock.mock.invocationCallOrder[0];
            expect(showOrder).toBeLessThan(sendOrder);
        });

        it('surfaces an error when project.path is missing (no terminal created)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ path: '' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                makeLogger() as never,
            );

            await command.execute(project as Project);

            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
        });

        it('surfaces an error when no project is provided (no terminal created)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(null) as never,
                makeLogger() as never,
            );

            await command.execute(undefined as unknown as Project);

            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
        });
    });
});
