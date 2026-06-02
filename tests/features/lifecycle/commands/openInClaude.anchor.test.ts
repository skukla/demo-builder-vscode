/**
 * Anchor-on-demand for OpenInClaudeCommand.execute().
 *
 * Browsing/selecting a project no longer reloads the window; the workspace only
 * anchors when the user launches a workspace-requiring action (AI Chat /
 * terminal). That anchor lives in `OpenInClaudeCommand.execute()`:
 *   - When the target project differs from the open workspace folder, it writes
 *     a `PENDING_CLAUDE_LAUNCH_KEY` record and reloads via `vscode.openFolder`
 *     (then returns — the post-reload activation replays the launch).
 *   - When they match, it spawns the terminal directly (no reload).
 *
 * Split from the terminal-surface suite so the anchor behavior is isolated.
 */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

import * as vscode from 'vscode';

import { OpenInClaudeCommand, PENDING_CLAUDE_LAUNCH_KEY } from '@/commands/openInClaude';
import { BaseWebviewCommand } from '@/core/base';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand — anchor-on-demand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.commands.executeCommand as jest.Mock).mockReset();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    });

    afterEach(() => {
        // Release any transition lock acquired by an anchor path so the 3s
        // safety setTimeout does not leak into subsequent tests.
        BaseWebviewCommand.endWebviewTransition();
    });

    it('anchors (writes pending record + openFolder, does NOT spawn) when project.path ≠ workspaceFolders[0]', async () => {
        const mocks = setupVscodeMocks({ workspaceFolderPath: '/some/other/repo' });
        const globalState = makeGlobalState();
        const project = makeProject({ name: 'demo', path: '/projects/demo' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(project) as never,
            makeLogger() as never,
        );

        await command.execute(project as Project);

        // Pending record written (no prompt → empty string)
        expect(globalState.update).toHaveBeenCalledWith(
            PENDING_CLAUDE_LAUNCH_KEY,
            expect.objectContaining({
                projectPath: '/projects/demo',
                prompt: '',
                createdAt: expect.any(Number),
            }),
        );
        // Reload via openFolder (same window: forceNewWindow = false)
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.objectContaining({ fsPath: '/projects/demo' }),
            false,
        );
        // Did NOT spawn a terminal — that happens post-reload via the replay.
        expect(mocks.createTerminalMock).not.toHaveBeenCalled();
    });

    it('persists the supplied prompt in the pending record when anchoring', async () => {
        const globalState = makeGlobalState();
        setupVscodeMocks({ workspaceFolderPath: '/some/other/repo' });
        const project = makeProject({ name: 'demo', path: '/projects/demo' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(project) as never,
            makeLogger() as never,
        );

        await command.execute({ project: project as Project, prompt: 'Add a hero block' });

        expect(globalState.update).toHaveBeenCalledWith(
            PENDING_CLAUDE_LAUNCH_KEY,
            expect.objectContaining({
                projectPath: '/projects/demo',
                prompt: 'Add a hero block',
                createdAt: expect.any(Number),
            }),
        );
    });

    it('anchors to the EXPLICIT project arg even when it differs from the state pointer', async () => {
        const globalState = makeGlobalState();
        setupVscodeMocks({ workspaceFolderPath: '/projects/pointer' });
        // State pointer is a different project than the explicit arg.
        const pointer = makeProject({ name: 'pointer', path: '/projects/pointer' });
        const explicit = makeProject({ name: 'explicit', path: '/projects/explicit' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(pointer) as never,
            makeLogger() as never,
        );

        await command.execute(explicit as Project);

        expect(globalState.update).toHaveBeenCalledWith(
            PENDING_CLAUDE_LAUNCH_KEY,
            expect.objectContaining({ projectPath: '/projects/explicit' }),
        );
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.objectContaining({ fsPath: '/projects/explicit' }),
            false,
        );
    });

    it('spawns the terminal directly (no anchor) when workspace already matches the project', async () => {
        const mocks = setupVscodeMocks({ workspaceFolderPath: '/projects/demo' });
        const globalState = makeGlobalState();
        const project = makeProject({ name: 'demo', path: '/projects/demo' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(project) as never,
            makeLogger() as never,
        );

        await command.execute(project as Project);

        // No anchor: no pending record, no openFolder.
        expect(globalState.update).not.toHaveBeenCalledWith(
            PENDING_CLAUDE_LAUNCH_KEY,
            expect.anything(),
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'vscode.openFolder',
            expect.anything(),
            expect.anything(),
        );
        // Spawned the terminal in-place.
        expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
    });

    it('no-prompt sidebar launch: anchors with prompt:"" when workspace differs', async () => {
        const mocks = setupVscodeMocks({ workspaceFolderPath: null });
        const globalState = makeGlobalState();
        const project = makeProject({ name: 'demo', path: '/projects/demo' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(project) as never,
            makeLogger() as never,
        );

        // No project arg, no prompt — resolves project from state (sidebar Chat).
        await command.execute();

        expect(globalState.update).toHaveBeenCalledWith(
            PENDING_CLAUDE_LAUNCH_KEY,
            expect.objectContaining({ projectPath: '/projects/demo', prompt: '' }),
        );
        expect(mocks.createTerminalMock).not.toHaveBeenCalled();
    });

    it('falls back to an in-place launch when openFolder throws (anchor failure)', async () => {
        const mocks = setupVscodeMocks({ workspaceFolderPath: '/some/other/repo' });
        const globalState = makeGlobalState();
        (vscode.commands.executeCommand as jest.Mock).mockImplementation((cmd: string) => {
            if (cmd === 'vscode.openFolder') {
                return Promise.reject(new Error('openFolder denied'));
            }
            return Promise.resolve(undefined);
        });
        const project = makeProject({ name: 'demo', path: '/projects/demo' });
        const command = new OpenInClaudeCommand(
            makeContext(globalState),
            makeStateManager(project) as never,
            makeLogger() as never,
        );

        await command.execute(project as Project);

        // Pending record cleared on failure.
        expect(globalState.update).toHaveBeenCalledWith(PENDING_CLAUDE_LAUNCH_KEY, undefined);
        // Fell back to launching the terminal in-place.
        expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
    });
});
