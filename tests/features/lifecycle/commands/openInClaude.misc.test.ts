/** Logging assertions, error surfaces, and project resolution — split from openInClaude.test.ts. */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks,
    makeLogger,
    makeStateManager,
    makeGlobalState,
    makeOpenInClaudeContext,
    makeOpenInClaudeProject,
} from './openInClaude.testkit';
import type { StateManager } from '@/core/state/stateManager';

// The home Chat always launches at the projects root. Pin the root so the
// cwd-in-log assertion is deterministic.
const PROJECTS_ROOT = '/projects';

describe('OpenInClaudeCommand', () => {
    let prevProjectsDir: string | undefined;

    beforeAll(() => {
        prevProjectsDir = process.env.DEMO_BUILDER_PROJECTS_DIR;
        process.env.DEMO_BUILDER_PROJECTS_DIR = PROJECTS_ROOT;
    });

    afterAll(() => {
        if (prevProjectsDir === undefined) {
            delete process.env.DEMO_BUILDER_PROJECTS_DIR;
        } else {
            process.env.DEMO_BUILDER_PROJECTS_DIR = prevProjectsDir;
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Logging
    // ------------------------------------------------------------------------

    describe('logging', () => {
        it('logs the projects-root cwd in the launch path', async () => {
            setupVscodeMocks();
            const logger = makeLogger();
            const project = makeOpenInClaudeProject({ name: 'my-demo-project' });
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(project) as unknown as StateManager,
                logger as never
            );

            await command.execute(project as Project);

            const allLogs = [...logger.info.mock.calls, ...logger.debug.mock.calls]
                .flat()
                .join(' ');
            expect(allLogs).toContain(PROJECTS_ROOT);
        });

        it('logs terminal spawned + location=editor-active (chat-first tab)', async () => {
            setupVscodeMocks();
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()) as never,
                logger as never
            );

            await command.execute(makeOpenInClaudeProject() as Project);

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
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()) as never,
                logger as never
            );

            await command.execute(makeOpenInClaudeProject() as Project);

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
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()) as never,
                logger as never
            );

            await command.execute(makeOpenInClaudeProject() as Project);

            expect(logger.error).toHaveBeenCalled();
            const errorShown =
                mocks.showErrorMessageMock.mock.calls.length > 0 ||
                mocks.showWarningMessageMock.mock.calls.length > 0;
            expect(errorShown).toBe(true);
        });
    });

    // ------------------------------------------------------------------------
    // Always-root launch
    // ------------------------------------------------------------------------

    describe('always-root launch', () => {
        it('launches at the projects root regardless of the current-project pointer', async () => {
            // The home Chat does not resolve a project; it always opens at the
            // projects root so one session addresses any project by name via MCP.
            const mocks = setupVscodeMocks({ workspaceFolderPath: '/p/state' });
            const project = makeOpenInClaudeProject({ name: 'from-state', path: '/p/state' });
            const stateManager = makeStateManager(project);
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                stateManager as never,
                makeLogger() as never
            );

            await command.execute();

            // The pointer IS read now — its name is stated in the home
            // AGENTS.md so a cold Chat need not spend a round trip on
            // `get_current_project`. What must never happen is the pointer
            // influencing WHERE the Chat opens: the project sits at /p/state and
            // the terminal still opens at the projects root.
            expect(stateManager.getCurrentProject).toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            const createArg = mocks.createTerminalMock.mock.calls[0][0];
            expect(createArg.cwd).toBe(PROJECTS_ROOT);
            expect(createArg.cwd).not.toBe(project.path);
        });
    });
});
