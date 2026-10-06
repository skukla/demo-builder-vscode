/**
 * One answer to "which agent, and can it start?" — shared by the Chat launch and
 * the "AI Ready" badge so the two cannot disagree (AI-12 step 08).
 */

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: () => false,
}));

import * as vscode from 'vscode';
import { agentCliStatus, resolveActiveEngine } from '@/features/ai/engine/activeEngine';
import { resetAgentCliCache, type CommandProbe } from '@/features/ai/engine/agentCli';

const only = (...installed: string[]): CommandProbe => ({
    commandExists: jest.fn(async (name: string) => installed.includes(name)),
});

function setEngine(engine: string | undefined): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => (key === 'engine' ? engine : undefined)),
    });
}

describe('resolveActiveEngine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetAgentCliCache();
    });

    it('reads demoBuilder.ai.engine', async () => {
        setEngine('claude-code');

        await resolveActiveEngine(only('claude'));

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.ai');
    });

    it('lets an explicit setting decide alone, and reports its CLI missing', async () => {
        setEngine('copilot-cli');
        const probe = only('claude');

        const active = await resolveActiveEngine(probe);

        expect(active.descriptor.id).toBe('copilot-cli');
        expect(active.installed).toBe(false);
        expect(probe.commandExists).not.toHaveBeenCalledWith('claude');
    });

    it.each([
        [['claude', 'copilot'], 'copilot-cli'],
        [['claude'], 'claude-code'],
        [[], 'copilot-vscode'],
    ])('under auto with %j installed, picks %s', async (installed, expected) => {
        setEngine('auto');

        const active = await resolveActiveEngine(only(...installed));

        expect(active.descriptor.id).toBe(expected);
        expect(active.installed).toBe(true);
    });
});

describe('resolveActiveEngine — defaults', () => {
    beforeEach(() => resetAgentCliCache());

    it("serves VS Code's chat when nothing is set, without probing any CLI", async () => {
        setEngine(undefined);
        const probe = only('claude', 'copilot');

        const active = await resolveActiveEngine(probe);

        expect(active.descriptor.id).toBe('copilot-vscode');
        expect(probe.commandExists).not.toHaveBeenCalled();
    });

    it('reads demoBuilder.ai.permissions, defaulting to ask', async () => {
        setEngine('claude-code');
        await expect(resolveActiveEngine(only('claude'))).resolves.toMatchObject({
            permissions: 'ask',
        });

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) => (key === 'permissions' ? 'full' : 'claude-code')),
        });
        await expect(resolveActiveEngine(only('claude'))).resolves.toMatchObject({
            permissions: 'full',
        });
    });
});

describe('agentCliStatus', () => {
    beforeEach(() => resetAgentCliCache());

    it("names the SC's chosen agent, not Claude Code", async () => {
        setEngine('copilot-cli');

        await expect(agentCliStatus(only())).resolves.toEqual({
            installed: false,
            name: 'Copilot CLI',
        });
    });
});
