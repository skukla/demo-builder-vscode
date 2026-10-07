/**
 * A warning the moment the SC picks an agent that cannot start — the nearest
 * thing to an error on the setting, which VS Code's Settings editor cannot show.
 */

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: () => false,
}));

import * as vscode from 'vscode';
import { resetAgentCliCache, type CommandProbe } from '@/features/ai/engine/agentCli';
import { USE_COPILOT, watchEngineChoice } from '@/features/ai/engine/engineChoiceWatch';

type Listener = (e: { affectsConfiguration: (s: string) => boolean }) => Promise<void>;

const probe = (claudeInstalled: boolean): CommandProbe => ({
    commandExists: jest.fn(async () => claudeInstalled),
});

function setup(opts: {
    engine: string | undefined;
    globalValue?: string;
    workspaceValue?: string;
    claudeInstalled: boolean;
}) {
    const update = jest.fn().mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => (key === 'engine' ? opts.engine : undefined)),
        inspect: jest.fn(() => ({ globalValue: opts.globalValue, workspaceValue: opts.workspaceValue })),
        update,
    });
    watchEngineChoice(probe(opts.claudeInstalled));
    const listener = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls.at(-1)![0] as Listener;
    const change = (section: string) => listener({ affectsConfiguration: (s) => s === section });
    return { update, change };
}

beforeEach(() => {
    jest.clearAllMocks();
    resetAgentCliCache();
});

describe('watchEngineChoice', () => {
    it('warns when Claude Code is chosen and `claude` is missing', async () => {
        const { change } = setup({ engine: 'claude-code', globalValue: 'claude-code', claudeInstalled: false });

        await change('demoBuilder.ai.engine');

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Claude Code (the command-line tool) is not installed, so Chat cannot open it.',
            USE_COPILOT,
        );
    });

    it('says nothing when Claude Code is installed', async () => {
        const { change } = setup({ engine: 'claude-code', claudeInstalled: true });

        await change('demoBuilder.ai.engine');

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('says nothing for Copilot in VS Code, which needs no CLI', async () => {
        const { change } = setup({ engine: 'copilot-vscode', claudeInstalled: false });

        await change('demoBuilder.ai.engine');

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('ignores every other setting', async () => {
        const { change } = setup({ engine: 'claude-code', claudeInstalled: false });

        await change('demoBuilder.ai.permissions');

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('clears the choice in every scope that holds it when the SC picks Copilot', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce(USE_COPILOT);
        const { change, update } = setup({
            engine: 'claude-code',
            globalValue: 'claude-code',
            workspaceValue: 'claude-code',
            claudeInstalled: false,
        });

        await change('demoBuilder.ai.engine');

        expect(update).toHaveBeenCalledWith('engine', undefined, vscode.ConfigurationTarget.Workspace);
        expect(update).toHaveBeenCalledWith('engine', undefined, vscode.ConfigurationTarget.Global);
    });

    it('clears only the scope that holds it', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce(USE_COPILOT);
        const { change, update } = setup({ engine: 'claude-code', globalValue: 'claude-code', claudeInstalled: false });

        await change('demoBuilder.ai.engine');

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith('engine', undefined, vscode.ConfigurationTarget.Global);
    });

    it('leaves the setting alone when the warning is dismissed', async () => {
        const { change, update } = setup({ engine: 'claude-code', globalValue: 'claude-code', claudeInstalled: false });

        await change('demoBuilder.ai.engine');

        expect(update).not.toHaveBeenCalled();
    });
});
