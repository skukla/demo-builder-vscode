/**
 * The Chat launch serves the SC's agent, not only Claude Code (AI-12 step 08).
 *
 * `demoBuilder.ai.engine` decides: Copilot CLI runs in its own terminal with `-i`,
 * resuming THIS directory's newest session by ID; Copilot in VS Code opens VS
 * Code's chat in agent mode with the prompt; a missing CLI is named by the agent
 * the SC chose.
 */

jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));
jest.mock('@/features/ai/engine/copilotSessionStore', () => ({
    latestCopilotSession: jest.fn(() => undefined),
}));
// Nothing at the known install locations: only the probe decides what is installed.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: () => false,
}));
jest.mock('@/features/project-creation/services/aiBundle/homeAiContextWriter', () => ({
    refreshHomeAgentsMd: jest.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { OpenInClaudeCommand, isClaudeChatOpen } from '@/commands/openInClaude';
import { resetAgentCliCache, type CommandProbe } from '@/features/ai/engine/agentCli';
import { latestCopilotSession } from '@/features/ai/engine/copilotSessionStore';
import {
    setupVscodeMocks,
    makeLogger,
    makeStateManager,
    makeGlobalState,
    makeOpenInClaudeContext,
    makeOpenInClaudeProject,
} from './openInClaude.testUtils';

const PROJECTS_ROOT = '/projects';

function makeCommand(probe: CommandProbe): OpenInClaudeCommand {
    return new OpenInClaudeCommand(
        makeOpenInClaudeContext(makeGlobalState()),
        makeStateManager(makeOpenInClaudeProject({ name: 'justrite' })),
        makeLogger(),
        probe,
    );
}

const only = (...installed: string[]): CommandProbe => ({
    commandExists: jest.fn(async (name: string) => installed.includes(name)),
});

describe('OpenInClaudeCommand — per engine', () => {
    let prevProjectsDir: string | undefined;

    beforeAll(() => {
        prevProjectsDir = process.env.DEMO_BUILDER_PROJECTS_DIR;
        process.env.DEMO_BUILDER_PROJECTS_DIR = PROJECTS_ROOT;
    });

    afterAll(() => {
        if (prevProjectsDir === undefined) delete process.env.DEMO_BUILDER_PROJECTS_DIR;
        else process.env.DEMO_BUILDER_PROJECTS_DIR = prevProjectsDir;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetAgentCliCache();
        (latestCopilotSession as jest.Mock).mockReturnValue(undefined);
    });

    describe('Copilot CLI', () => {
        it('opens a "Copilot" terminal at the projects root running the prompt with -i', async () => {
            const mocks = setupVscodeMocks({ engine: 'copilot-cli' });

            await makeCommand(only('copilot')).execute({ prompt: 'List my projects' });

            expect(mocks.createTerminalMock).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Copilot', cwd: PROJECTS_ROOT }),
            );
            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith("copilot -i 'List my projects'");
        });

        it("resumes this directory's newest session by ID, and re-homes the prompt", async () => {
            const mocks = setupVscodeMocks({ engine: 'copilot-cli' });
            (latestCopilotSession as jest.Mock).mockReturnValue('sess-1');

            await makeCommand(only('copilot')).execute({ prompt: 'hi' });

            expect(latestCopilotSession).toHaveBeenCalledWith(PROJECTS_ROOT);
            const line = mocks.terminalSendTextMock.mock.calls[0][0] as string;
            expect(line.startsWith("copilot --resume 'sess-1' -i '")).toBe(true);
            expect(line).toContain('The active demo project is now "justrite"');
        });

        it('opens Copilot\'s own earlier-chat list (`copilot --resume`)', async () => {
            const mocks = setupVscodeMocks({ engine: 'copilot-cli' });
            (latestCopilotSession as jest.Mock).mockReturnValue('sess-1');

            await makeCommand(only('copilot')).execute({ pickPast: true });

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('copilot --resume');
        });

        it('pastes into a live Copilot terminal, never into a live Claude Code one', async () => {
            const mocks = setupVscodeMocks({
                engine: 'copilot-cli',
                existingTerminals: [{ name: 'Claude Code' }],
            });

            await makeCommand(only('copilot')).execute({ prompt: 'hi' });

            expect(mocks.existingTerminalShowMocks[0]).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Copilot' }),
            );
        });

        it('names Copilot CLI, and its install page, when it is missing', async () => {
            const mocks = setupVscodeMocks({ engine: 'copilot-cli' });
            mocks.showWarningMessageMock.mockResolvedValue('How to install');

            await makeCommand(only('claude')).execute({ prompt: 'hi' });

            expect(mocks.showWarningMessageMock).toHaveBeenCalledWith(
                expect.stringMatching(/^Copilot CLI \(the command-line tool\) is not installed/),
                'How to install',
            );
            expect(vscode.Uri.parse).toHaveBeenCalledWith(
                expect.stringContaining('docs.github.com/en/copilot'),
            );
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });
    });

    describe('auto', () => {
        it('prefers Copilot CLI when both are installed', async () => {
            const mocks = setupVscodeMocks({ engine: 'auto' });

            await makeCommand(only('claude', 'copilot')).execute({ prompt: 'hi' });

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith("copilot -i 'hi'");
        });

        it('uses Claude Code when only it is installed', async () => {
            const mocks = setupVscodeMocks({ engine: 'auto' });

            await makeCommand(only('claude')).execute({ prompt: 'hi' });

            expect(mocks.terminalSendTextMock).toHaveBeenCalledWith("claude -- 'hi'");
        });
    });

    describe('Copilot in VS Code', () => {
        it("opens VS Code's chat in agent mode with the prompt, re-homed, and no terminal", async () => {
            const mocks = setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute({ prompt: 'hi' });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.action.chat.open',
                expect.objectContaining({
                    mode: 'agent',
                    isPartialQuery: false,
                    query: expect.stringMatching(/justrite[\s\S]*hi$/),
                }),
            );
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('starts a new chat first for New Chat', async () => {
            setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute({ fresh: true });

            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map((c) => c[0]);
            expect(ids).toEqual(['workbench.action.chat.newChat', 'workbench.action.chat.open']);
        });

        it("opens VS Code's agent sessions list for an earlier chat", async () => {
            setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute({ pickPast: true });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.action.chat.focusAgentSessionsViewer',
            );
        });
    });

    it('counts a live chat of ANY engine as open (the AI icon)', () => {
        setupVscodeMocks({ existingTerminals: [{ name: 'Copilot' }] });

        expect(isClaudeChatOpen()).toBe(true);
    });
});
