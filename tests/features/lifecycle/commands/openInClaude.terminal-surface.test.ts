/** Terminal surface: forced launch, find-or-spawn, location selection, terminal behavior — split from openInClaude.test.ts. */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

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
    // Terminal-only launch (the extension surface was retired)
    // ------------------------------------------------------------------------

    describe('terminal launch', () => {
        it('always opens a terminal — there is no extension fallback', async () => {
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('uses plain `claude` on cold start (no prior conversation)', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });

        it('uses `claude --continue` when a prior conversation exists for the cwd', async () => {
            const mocks = setupVscodeMocks({ hasClaudeConversation: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });

        it('probes the session store using the project path', async () => {
            // Workspace = project path so execute() spawns in-place (no anchor).
            const mocks = setupVscodeMocks({
                hasClaudeConversation: false,
                workspaceFolderPath: '/Users/kukla/projects/demo',
            });
            const project = makeProject({ path: '/Users/kukla/projects/demo' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                makeLogger() as never,
            );

            await command.execute(project as Project);

            expect(mocks.hasClaudeConversationMock).toHaveBeenCalledWith('/Users/kukla/projects/demo');
        });
    });

    // ------------------------------------------------------------------------
    // Terminal find-or-spawn
    // ------------------------------------------------------------------------

    describe('terminal find-or-spawn', () => {
        it('reuses an existing live "Claude Code" terminal instead of spawning a new one', async () => {
            const mocks = setupVscodeMocks({
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
                existingTerminals: [{ name: 'Claude Code', exitStatus: { code: 0 } }],
                // A prior session likely exists when a terminal has just exited.
                hasClaudeConversation: true,
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
    // the active group (ViewColumn.Active).
    // ------------------------------------------------------------------------

    describe('launchTerminal location selection', () => {
        it('opens the terminal as a tab in the active editor group (ViewColumn.Active)', async () => {
            const mocks = setupVscodeMocks();
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
    });

    // ------------------------------------------------------------------------
    // isClaudeChatOpen() — true iff a live "Claude Code" terminal exists
    // (exitStatus undefined). Backs the state-aware AI icon in aiMenu.
    // ------------------------------------------------------------------------

    describe('isClaudeChatOpen()', () => {
        it('returns true when a live "Claude Code" terminal exists', () => {
            setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });

            expect(isClaudeChatOpen()).toBe(true);
        });

        it('returns false when the only "Claude Code" terminal has exited', () => {
            setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: { code: 0 } }],
            });

            expect(isClaudeChatOpen()).toBe(false);
        });

        it('returns false when no terminals are open', () => {
            setupVscodeMocks({
                existingTerminals: [],
            });

            expect(isClaudeChatOpen()).toBe(false);
        });

        it('ignores live terminals with non-matching names', () => {
            setupVscodeMocks({
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
            const mocks = setupVscodeMocks();
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

        it('calls term.show() before sendText(launch command)', async () => {
            const mocks = setupVscodeMocks();
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
            const mocks = setupVscodeMocks();
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
            const mocks = setupVscodeMocks();
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
