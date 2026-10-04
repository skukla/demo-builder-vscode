/**
 * "Pick an earlier chat" (AI-4b) — the Chat tile's third way in, beside continue
 * and new. Claude Code ships its own searchable session picker (`claude --resume`
 * with no value), so the command's whole job is to launch it: no session list of
 * our own, which would be a second thing to keep in step with the transcripts.
 */

// Must declare the session-store mock before importing OpenInClaudeCommand
// or the testkit — Jest only hoists `jest.mock` within a single file.
jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));

// The home AGENTS.md write is a real fs write at the resolved root.
jest.mock('@/features/project-creation/services/aiBundle/homeAiContextWriter', () => ({
    refreshHomeAgentsMd: jest.fn().mockResolvedValue(undefined),
}));

import { OpenInClaudeCommand } from '@/commands/openInClaude';
import {
    setupVscodeMocks,
    makeLogger,
    makeStateManager,
    makeGlobalState,
    makeOpenInClaudeContext,
    makeOpenInClaudeProject,
    claudePresent,
} from './openInClaude.testUtils';

const PROJECTS_ROOT = '/projects';

function makeCommand(): OpenInClaudeCommand {
    return new OpenInClaudeCommand(
        makeOpenInClaudeContext(makeGlobalState()),
        makeStateManager(makeOpenInClaudeProject()),
        makeLogger(),
        claudePresent(),
    );
}

describe('OpenInClaudeCommand — pickPast (resume an earlier chat)', () => {
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

    it('opens Claude Code\'s own picker: `claude --resume` with no session id', async () => {
        const mocks = setupVscodeMocks({ hasClaudeConversation: true });

        await makeCommand().execute({ pickPast: true });

        expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        expect(mocks.terminalSendTextMock).toHaveBeenCalledTimes(1);
        expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --resume');
    });

    it('asks the session store about the projects root — where the home Chat lives', async () => {
        const mocks = setupVscodeMocks({ hasClaudeConversation: true });

        await makeCommand().execute({ pickPast: true });

        expect(mocks.hasClaudeConversationMock).toHaveBeenCalledWith(PROJECTS_ROOT);
    });

    it('retires the running chat terminal first, so the SC is left with one Claude Code tab', async () => {
        const mocks = setupVscodeMocks({
            existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            hasClaudeConversation: true,
        });

        await makeCommand().execute({ pickPast: true });

        expect(mocks.existingTerminalDisposeMocks[0]).toHaveBeenCalledTimes(1);
        expect(mocks.existingTerminalShowMocks[0]).not.toHaveBeenCalled();
        expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude --resume');
    });

    it('with no earlier chat, says so and opens nothing', async () => {
        const mocks = setupVscodeMocks({
            existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            hasClaudeConversation: false,
        });

        await makeCommand().execute({ pickPast: true });

        expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        expect(mocks.existingTerminalDisposeMocks[0]).not.toHaveBeenCalled();
        expect(mocks.showInformationMessageMock).toHaveBeenCalledWith(
            'There are no earlier chats to pick from yet.',
        );
    });
});
