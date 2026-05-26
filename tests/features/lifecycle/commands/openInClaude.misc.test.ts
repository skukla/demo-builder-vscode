/** Logging assertions, error surfaces, and project resolution — split from openInClaude.test.ts. */
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
    DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL, USE_EXTENSION_ACTION_LABEL,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Logging
    // ------------------------------------------------------------------------

    describe('logging', () => {
        it('logs the engine and surface chosen', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allLogs = [
                ...logger.info.mock.calls,
                ...logger.debug.mock.calls,
            ].flat().join(' ');
            expect(allLogs).toMatch(/surface/i);
        });

        it('logs project.name in the launch path', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const logger = makeLogger();
            const project = makeProject({ name: 'my-demo-project' });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(project) as never,
                logger as never,
            );

            await command.execute(project as Project);

            const allLogs = [
                ...logger.info.mock.calls,
                ...logger.debug.mock.calls,
            ].flat().join(' ');
            expect(allLogs).toContain('my-demo-project');
        });

        it('logs the dock offer outcome=accepted when user clicks Dock to right side', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] dock offer outcome: accepted/);
        });

        it('logs the dock offer outcome=use-default when user clicks Use default', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] dock offer outcome: use-default/);
        });

        it('logs the extension offer outcome=use-extension when user accepts', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_EXTENSION_ACTION_LABEL);
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/\[Open in Claude\] extension offer outcome: use-extension/);
        });

        it('logs warn when openExternal returns false', async () => {
            setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                openExternalResult: false,
            });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allWarn = logger.warn.mock.calls.flat().join(' ');
            expect(allWarn).toMatch(/\[Open in Claude\] openExternal returned false/);
        });

        it('logs terminal spawned + location=panel when dockToRight=false', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false, dockToRight: false });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal spawned/);
            expect(allInfo).toMatch(/location=panel/);
        });

        it('logs terminal spawned + location=editor-beside when dockToRight=true', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false, dockToRight: true });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal spawned/);
            expect(allInfo).toMatch(/location=editor-beside/);
        });

        it('logs terminal reused (no spawn) when existing terminal found', async () => {
            setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal reused/);
        });
    });

    // ------------------------------------------------------------------------
    // Error surfaces
    // ------------------------------------------------------------------------

    describe('error surfaces', () => {
        it('shows a warning when openExternal returns false (does NOT fall back to terminal)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                openExternalResult: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.showWarningMessageMock).toHaveBeenCalled();
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('logs and surfaces a user-visible error when openExternal throws', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.openExternalMock.mockRejectedValueOnce(new Error('boom'));

            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            expect(logger.error).toHaveBeenCalled();
            const errorShown =
                mocks.showErrorMessageMock.mock.calls.length > 0 ||
                mocks.showWarningMessageMock.mock.calls.length > 0;
            expect(errorShown).toBe(true);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('logs and surfaces an error when createTerminal throws', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            mocks.createTerminalMock.mockImplementationOnce(() => {
                throw new Error('terminal denied');
            });

            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            expect(logger.error).toHaveBeenCalled();
            const errorShown =
                mocks.showErrorMessageMock.mock.calls.length > 0 ||
                mocks.showWarningMessageMock.mock.calls.length > 0;
            expect(errorShown).toBe(true);
        });
    });

    // ------------------------------------------------------------------------
    // Project resolution
    // ------------------------------------------------------------------------

    describe('project resolution', () => {
        it('falls back to StateManager.getCurrentProject() when invoked without a project argument', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const project = makeProject({ name: 'from-state', path: '/p/state' });
            const stateManager = makeStateManager(project);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                stateManager as never,
                makeLogger() as never,
            );

            await command.execute();

            expect(stateManager.getCurrentProject).toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg.cwd).toBe('/p/state');
        });
    });
});
