/**
 * The Chat launch serves the SC's agent, not only Claude Code (AI-12 step 08).
 *
 * `demoBuilder.ai.engine` decides: Copilot in VS Code (the default) opens VS
 * Code's chat in agent mode with the prompt; Claude Code has its own suites.
 */

jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
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
    });

    describe('a setting an earlier beta accepted', () => {
        it.each(['copilot-cli', 'auto'])(
            "%s opens VS Code's chat — Copilot CLI is no longer a Chat choice",
            async (engine) => {
                const mocks = setupVscodeMocks({ engine });

                await makeCommand(only('claude', 'copilot')).execute({ prompt: 'hi' });

                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'workbench.action.chat.open',
                    expect.objectContaining({ mode: 'agent' }),
                );
                expect(mocks.createTerminalMock).not.toHaveBeenCalled();
            },
        );
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

        it('leaves the chat the SC is already in alone when New Chat was not asked for', async () => {
            setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute({ prompt: 'hi' });

            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map((c) => c[0]);
            expect(ids).toStrictEqual(['workbench.action.chat.open']);
        });

        it('opens the chat in agent mode, with nothing typed, when there is no prompt', async () => {
            setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
                mode: 'agent',
            });
        });

        it("opens VS Code's agent sessions list for an earlier chat", async () => {
            setupVscodeMocks({ engine: 'copilot-vscode' });

            await makeCommand(only()).execute({ pickPast: true });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.action.chat.focusAgentSessionsViewer',
            );
        });
    });

    it('counts a live Claude Code chat as open (the AI icon)', () => {
        setupVscodeMocks({ existingTerminals: [{ name: 'Claude Code' }] });

        expect(isClaudeChatOpen()).toBe(true);
    });
});
