/** Logging assertions, error surfaces, and project resolution — split from openInClaude.test.ts. */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

// The home AGENTS.md write is a real fs write at the resolved root. Every other
// test here points that root at a path that does not exist, so it fails silently —
// but the empty-root test below resolves to '', and the writer then landed an
// AGENTS.md in the repo working tree.
jest.mock('@/features/project-creation/services/aiBundle/homeAiContextWriter', () => ({
    refreshHomeAgentsMd: jest.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { OpenInClaudeCommand, resetAiOnboardingState } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks,
    makeLogger,
    makeStateManager,
    makeGlobalState,
    makeOpenInClaudeContext,
    makeOpenInClaudeProject,
} from './openInClaude.testUtils';
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
                logger
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
                makeStateManager(makeOpenInClaudeProject()) as unknown as StateManager,
                logger
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
                makeStateManager(makeOpenInClaudeProject()) as unknown as StateManager,
                logger
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
                makeStateManager(makeOpenInClaudeProject()) as unknown as StateManager,
                logger
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
    // The current-project pointer: an optimisation that must never block a launch
    // ------------------------------------------------------------------------

    describe('current-project pointer', () => {
        it('stays silent when no project is selected, and still launches', async () => {
            const mocks = setupVscodeMocks();
            const logger = makeLogger();
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(null),
                logger
            );

            await command.execute();

            // No pointer is the ordinary case, not a failure. Reaching through it
            // unguarded turns it into one, and the log is the only trace either way.
            expect(logger.debug).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('records a pointer read that throws, and launches anyway', async () => {
            const mocks = setupVscodeMocks();
            const logger = makeLogger();
            const stateManager = makeStateManager(makeOpenInClaudeProject());
            stateManager.getCurrentProject.mockRejectedValue(new Error('manifest unreadable'));
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                stateManager,
                logger
            );

            await command.execute();

            // Swallowed on purpose — naming the WRONG project is worse than naming
            // none — but a swallow with no trace is how this stops being findable.
            expect(logger.debug).toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });
    });

    // ------------------------------------------------------------------------
    // No directory to launch in
    // ------------------------------------------------------------------------

    describe('no projects root', () => {
        it('refuses to launch and says so when the root resolves to nothing', async () => {
            process.env.DEMO_BUILDER_PROJECTS_DIR = '';
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()),
                makeLogger()
            );

            try {
                await command.execute();

                // A terminal spawned at '' opens wherever VS Code happens to be,
                // which is the one place the home Chat must not run.
                expect(mocks.createTerminalMock).not.toHaveBeenCalled();
                expect(mocks.showErrorMessageMock).toHaveBeenCalled();
            } finally {
                process.env.DEMO_BUILDER_PROJECTS_DIR = PROJECTS_ROOT;
            }
        });
    });

    // ------------------------------------------------------------------------
    // New Chat
    // ------------------------------------------------------------------------

    describe('fresh: true (New Chat)', () => {
        it('retires the live terminal and spawns a process that does not resume', async () => {
            const mocks = setupVscodeMocks({
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
                // A prior conversation exists — New Chat must NOT land on it.
                hasClaudeConversation: true,
            });
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()),
                makeLogger()
            );

            await command.execute({ fresh: true });

            // Leaving the old terminal alive gives the user two Claude Code tabs,
            // and resuming is what makes a New Chat wear the old conversation.
            expect(mocks.existingTerminalDisposeMocks[0]).toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        });
    });

    // ------------------------------------------------------------------------
    // The one-time clipboard tip
    // ------------------------------------------------------------------------

    describe('clipboard-fallback tip', () => {
        it('does not fire on a launch that carries no prompt', async () => {
            const mocks = setupVscodeMocks();
            const command = new OpenInClaudeCommand(
                makeOpenInClaudeContext(makeGlobalState()),
                makeStateManager(makeOpenInClaudeProject()),
                makeLogger()
            );

            await command.execute();

            // The tip explains a clipboard fallback for a prompt. With no prompt
            // nothing was copied and there is nothing to explain.
            expect(mocks.showInformationMessageMock).not.toHaveBeenCalled();
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
                stateManager,
                makeLogger()
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

/**
 * The dev-only Reset AI Onboarding command's whole body. Nothing else clears these
 * flags, so an emptied function leaves the first-run experience untestable — and
 * says nothing while doing it.
 */
describe('resetAiOnboardingState', () => {
    it('clears every one-time AI flag and the claudeCode location we used to write', async () => {
        const globalState = makeGlobalState({
            'demoBuilder.ai.clipboardFallbackTipShown': true,
        });
        const configUpdate = jest.fn().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn(),
            update: configUpdate,
        });

        await resetAiOnboardingState(makeOpenInClaudeContext(globalState));

        const cleared = globalState.update.mock.calls.map((c) => c[0]);
        expect(cleared).toEqual([
            'demoBuilder.ai.clipboardFallbackTipShown',
            'demoBuilder.ai.pendingClaudeLaunch',
            'demoBuilder.ai.extensionAvailableOfferShown',
            'demoBuilder.ai.extensionMismatchWarningShown',
            'demoBuilder.ai.firstLaunchDialogShown',
            'demoBuilder.ai.sessionsBrowserAutoShown',
            'demoBuilder.ai.onboardingCompleted',
            'demoBuilder.ai.firstClaudeOpenTipShown',
        ]);
        // Cleared, not set to a value: every one of these is "undefined means unset".
        expect(globalState.update.mock.calls.every((c) => c[1] === undefined)).toBe(true);
        expect(configUpdate).toHaveBeenCalledWith(
            'preferredLocation',
            undefined,
            vscode.ConfigurationTarget.Global
        );
    });
});
