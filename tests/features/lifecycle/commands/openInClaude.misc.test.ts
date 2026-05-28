/** Logging assertions, error surfaces, and project resolution — split from openInClaude.test.ts. */
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
    // Logging
    // ------------------------------------------------------------------------

    describe('logging', () => {
        it('logs project.name in the launch path', async () => {
            setupVscodeMocks();
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

        it('logs terminal spawned + location=editor-active (chat-first tab)', async () => {
            setupVscodeMocks();
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                logger as never,
            );

            await command.execute(makeProject() as Project);

            const allInfo = logger.info.mock.calls.flat().join(' ');
            expect(allInfo).toMatch(/terminal spawned/);
            expect(allInfo).toMatch(/location=editor-active/);
        });

        it('logs terminal reused (no spawn) when existing terminal found', async () => {
            setupVscodeMocks({
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
        it('logs and surfaces an error when createTerminal throws', async () => {
            const mocks = setupVscodeMocks();
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
            const mocks = setupVscodeMocks();
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
