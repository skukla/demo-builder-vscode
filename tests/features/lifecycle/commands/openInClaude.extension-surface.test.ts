/** Extension surface: URI launch, workspace anchoring, prompt arg, dock-right editor split — split from openInClaude.test.ts. */
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
    // Surface=extension
    // ------------------------------------------------------------------------

    describe("surface='extension'", () => {
        it('URI launches when extension is installed', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("shows an error dialog with Install + Switch actions when extension is NOT installed", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce(undefined); // user dismisses
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showErrorMessageMock).toHaveBeenCalled();
            const args = mocks.showErrorMessageMock.mock.calls[0];
            const message = args[0] as string;
            const actionButtons = args.slice(1) as string[];
            expect(message.toLowerCase()).toMatch(/claude code/);
            expect(actionButtons).toEqual(
                expect.arrayContaining([
                    expect.stringMatching(/install/i),
                    expect.stringMatching(/terminal/i),
                ]),
            );
            // No launch happened (user dismissed)
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it("Install action opens the marketplace entry for the Claude Code extension", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce('Install Claude Code Extension');
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(executeCommandMock).toHaveBeenCalledWith('extension.open', 'anthropic.claude-code');
        });

        it("Switch to Terminal Mode action updates the setting AND launches the terminal", async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            mocks.showErrorMessageMock.mockResolvedValueOnce('Switch to Terminal Mode');

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'surface',
                'terminal',
                expect.anything(),
            );
            // Terminal launches after the switch
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --continue');
        });
    });

    // ------------------------------------------------------------------------
    // Workspace anchoring (extension-mode mismatch warning)
    // ------------------------------------------------------------------------

    describe('workspace anchoring', () => {
        it('extension mode shows a one-time mismatch warning when workspace !== project, then URI-launches anyway', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/some/other/repo',
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Warning toast surfaces the trade-off the user implicitly accepted
            expect(mocks.showWarningMessageMock).toHaveBeenCalled();
            const warningText = mocks.showWarningMessageMock.mock.calls[0][0] as string;
            expect(warningText.toLowerCase()).toMatch(/(workspace|project context)/);

            // URI launch still happens — user explicitly forced extension mode
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('extension mode does NOT warn when workspace === project.path', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/projects/demo',
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.showWarningMessageMock).not.toHaveBeenCalled();
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('extension mode warning fires only once ever (persistent globalState)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                workspaceFolderPath: '/some/other/repo',
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);
            await command.execute(makeProject() as Project);

            // Only one warning across two invocations
            expect(mocks.showWarningMessageMock).toHaveBeenCalledTimes(1);
            // Both URI launches still happen
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(2);
        });
    });

    // ------------------------------------------------------------------------
    // Prompt argument
    // ------------------------------------------------------------------------

    describe('prompt argument', () => {
        it('URI includes the prompt query parameter when called with { prompt }', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ prompt: 'foo' });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open?prompt=foo');
        });

        it('URL-encodes a prompt with spaces and special characters', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            const promptText = 'has spaces & special=chars';
            await command.execute({ prompt: promptText });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe(
                `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(promptText)}`,
            );
        });

        it('URI is the bare open URL when called with { project } only (no prompt)', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ project: makeProject() as Project });

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open');
        });

        it('URI is the bare open URL when called with no argument', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute();

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const uriArg = mocks.openExternalMock.mock.calls[0][0];
            expect(String(uriArg)).toBe('vscode://anthropic.claude-code/open');
        });

        it('terminal-mode delivers the prompt via the launch arg + clipboard (not URI args)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute({ prompt: 'add a hero block', project: makeProject() as Project });

            // URI handler never used in terminal mode
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            // Prompt copied to clipboard (fallback)
            expect(mocks.clipboardWriteMock).toHaveBeenCalledWith('add a hero block');
            // Terminal spawned with the prompt riding the --continue launch arg
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith("claude --continue -- 'add a hero block'");
        });
    });

    // ------------------------------------------------------------------------
    // Dock-to-right: extension surface chat-tab placement
    //
    // Claude Code's URI handler always opens the chat as a new editor tab in
    // the active group. To put the chat in a right-side editor split (matching
    // the dock-to-right layout the user opted into), we ensure a second editor
    // group exists and focus it BEFORE the URI launch.
    // ------------------------------------------------------------------------

    describe('launchViaUri respects dockToRight by placing the chat in a right editor split', () => {
        const FOCUS_SECOND = 'workbench.action.focusSecondEditorGroup';
        const SPLIT_RIGHT = 'workbench.action.splitEditorRight';

        function setTabGroups(columns: number[]): void {
            (vscode.window as unknown as {
                tabGroups: { all: { viewColumn: number }[] };
            }).tabGroups.all = columns.map(c => ({ viewColumn: c }));
        }

        it('splits the editor right when only one group exists, then focuses the new group before the URI launch', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            setTabGroups([1]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            const splitIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === SPLIT_RIGHT);
            const focusIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === FOCUS_SECOND);
            const launchOrder = mocks.openExternalMock.mock.invocationCallOrder[0];

            expect(cmdCalls).toEqual(expect.arrayContaining([SPLIT_RIGHT, FOCUS_SECOND]));
            const splitInvocation = executeCommandMock.mock.invocationCallOrder[splitIdx];
            const focusInvocation = executeCommandMock.mock.invocationCallOrder[focusIdx];
            expect(splitInvocation).toBeLessThan(focusInvocation); // split before focus
            expect(focusInvocation).toBeLessThan(launchOrder); // focus before launch
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('skips the split when a second editor group already exists, but still focuses it before launch', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            setTabGroups([1, 2]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            expect(cmdCalls).not.toContain(SPLIT_RIGHT);
            expect(cmdCalls).toContain(FOCUS_SECOND);
            const focusIdx = executeCommandMock.mock.calls.findIndex(c => c[0] === FOCUS_SECOND);
            const focusInvocation = executeCommandMock.mock.invocationCallOrder[focusIdx];
            const launchOrder = mocks.openExternalMock.mock.invocationCallOrder[0];
            expect(focusInvocation).toBeLessThan(launchOrder);
        });

        it('does NOT split or focus when dockToRight is false', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: false,
            });
            setTabGroups([1]);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const cmdCalls = executeCommandMock.mock.calls.map(c => c[0] as string);
            expect(cmdCalls).not.toContain(SPLIT_RIGHT);
            expect(cmdCalls).not.toContain(FOCUS_SECOND);
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });
    });
});
