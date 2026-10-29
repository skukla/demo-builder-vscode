/**
 * "Open in Claude Code" on a machine WITHOUT Claude Code (AI-4a, the small fix).
 *
 * The field report: Claude Desktop installed, no `claude` command, and the click
 * produced `zsh: command not found: claude` in a terminal with no word about what
 * was missing. Now the command asks first, and a missing CLI gets a plain message
 * and NO terminal.
 */

jest.mock('@/commands/claudeSessionStore', () => ({
    hasConversation: jest.fn(() => false),
}));
// The check also looks at known install locations by file, and this machine may
// really have one. A module factory, not a spy: a spy on the `fs` namespace does
// not reach the module under test.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: () => false,
}));

import * as vscode from 'vscode';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { StateManager } from '@/core/state/stateManager';
import { resetAgentCliCache, type CommandProbe } from '@/features/ai/engine/agentCli';
import {
    claudePresent,
    makeGlobalState,
    makeLogger,
    makeOpenInClaudeContext,
    makeOpenInClaudeProject,
    makeStateManager,
    setupVscodeMocks,
} from './openInClaude.testUtils';

/** A machine with no `claude` anywhere the check looks. */
function claudeMissing(): CommandProbe {
    return { commandExists: jest.fn().mockResolvedValue(false) };
}

function build(probe: CommandProbe): OpenInClaudeCommand {
    return new OpenInClaudeCommand(
        makeOpenInClaudeContext(makeGlobalState()),
        makeStateManager(makeOpenInClaudeProject()) as unknown as StateManager,
        makeLogger(),
        probe,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    resetAgentCliCache();
});

describe('Open in Claude Code when Claude Code is not installed', () => {
    it('opens no terminal and types nothing', async () => {
        const mocks = setupVscodeMocks();

        await build(claudeMissing()).execute({ prompt: 'hello' });

        expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        expect(mocks.terminalSendTextMock).not.toHaveBeenCalled();
        expect(mocks.clipboardWriteMock).not.toHaveBeenCalled();
    });

    it('says plainly what is missing and names the default agent — no install help', async () => {
        const mocks = setupVscodeMocks();

        await build(claudeMissing()).execute();

        expect(mocks.showWarningMessageMock).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Claude Code \(the command-line tool\) is not installed.*Copilot in VS Code/,
            ),
        );
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('asks the command executor about `claude`', async () => {
        setupVscodeMocks();
        const probe = claudeMissing();

        await build(probe).execute();

        expect(probe.commandExists).toHaveBeenCalledWith('claude');
    });
});

describe('Open in Claude Code when Claude Code IS installed', () => {
    it('launches exactly as before', async () => {
        const mocks = setupVscodeMocks();

        await build(claudePresent()).execute();

        expect(mocks.terminalSendTextMock).toHaveBeenCalledWith('claude');
        expect(mocks.showWarningMessageMock).not.toHaveBeenCalled();
    });
});
