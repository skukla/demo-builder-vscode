/** Sessions browser auto-open (post-launch, extension surface only) — split from openInClaude.test.ts. */
import * as vscode from 'vscode';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
    STAY_IN_TERMINAL_ACTION_LABEL,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Sessions browser auto-open (post-launch, extension surface only)
    // ------------------------------------------------------------------------

    describe('sessions browser auto-open', () => {
        const SESSIONS_BROWSER_AUTO_SHOWN_KEY = 'demoBuilder.ai.sessionsBrowserAutoShown';

        it('fires after a successful URI launch when extension installed + flag unset', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Primary focus command was called
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            // Flag was set after successful open
            expect(globalState.update).toHaveBeenCalledWith(
                SESSIONS_BROWSER_AUTO_SHOWN_KEY,
                true,
            );
        });

        it('does NOT fire on terminal launch (avoids mixed-surface UX)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            // First toast (extension-detected offer): user picks Stay in Terminal
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Sessions browser was NOT opened
            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar'
                || c[0] === 'claudeVSCodeSessionsList.focus',
            );
            expect(sessionsCall).toBeUndefined();
            // Flag was NOT set
            const flagWrite = (globalState.update as jest.Mock).mock.calls.find(c =>
                c[0] === SESSIONS_BROWSER_AUTO_SHOWN_KEY,
            );
            expect(flagWrite).toBeUndefined();
        });

        it('does NOT fire when the flag is already set', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            // Flag already set (this user has already had the auto-open fire)
            const globalState = makeGlobalState({
                [SESSIONS_BROWSER_AUTO_SHOWN_KEY]: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(sessionsCall).toBeUndefined();
        });

        it('falls back to claudeVSCodeSessionsList.focus when primary command throws', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockImplementation(async (cmd: string) => {
                if (cmd === 'workbench.view.extension.claude-sessions-sidebar') {
                    throw new Error('container not found');
                }
                return undefined;
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Both commands attempted
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(executeCommandMock).toHaveBeenCalledWith('claudeVSCodeSessionsList.focus');
            // Flag set after fallback succeeds
            expect(globalState.update).toHaveBeenCalledWith(
                SESSIONS_BROWSER_AUTO_SHOWN_KEY,
                true,
            );
        });

        it('leaves flag unset when BOTH primary and fallback commands fail (retry next launch)', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockImplementation(async (cmd: string) => {
                if (
                    cmd === 'workbench.view.extension.claude-sessions-sidebar'
                    || cmd === 'claudeVSCodeSessionsList.focus'
                ) {
                    throw new Error('not available');
                }
                return undefined;
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Both attempted
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
            expect(executeCommandMock).toHaveBeenCalledWith('claudeVSCodeSessionsList.focus');
            // Flag NOT set — next launch gets another chance
            const flagWrite = (globalState.update as jest.Mock).mock.calls.find(c =>
                c[0] === SESSIONS_BROWSER_AUTO_SHOWN_KEY,
            );
            expect(flagWrite).toBeUndefined();
        });

        it('does NOT fire when extension is not installed (even on extension surface)', async () => {
            // surface=extension but extension missing → recovery dialog path,
            // not the URI launch path; sessions browser is irrelevant here.
            setupVscodeMocks({ surface: 'extension', extensionInstalled: false });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const sessionsCall = executeCommandMock.mock.calls.find(c =>
                c[0] === 'workbench.view.extension.claude-sessions-sidebar'
                || c[0] === 'claudeVSCodeSessionsList.focus',
            );
            expect(sessionsCall).toBeUndefined();
        });

        it('reveals the sessions browser on EVERY docked launch, even after the once-ever flag is set', async () => {
            // Docked layout expects chat + sessions side-by-side. Unlike the
            // non-docked once-ever auto-open, the docked path reveals the
            // sessions browser on every launch so switching back to the
            // extension surface restores both panes without a manual click.
            setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            // Flag already consumed by a prior launch — the non-docked path
            // would skip the reveal here.
            const globalState = makeGlobalState({
                [SESSIONS_BROWSER_AUTO_SHOWN_KEY]: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.view.extension.claude-sessions-sidebar',
            );
        });
    });
});
