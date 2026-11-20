/**
 * ConfigureCommand — Change Frontend Port's restart.
 *
 * It stopped and started the demo by hand: no pause between the two, and no project named, so
 * both halves acted on whichever project happened to be current. It runs the one restart now,
 * `demoBuilder.restartDemo`, for the project whose port it changed (PL-104 fix 12, F268).
 */

import * as vscode from 'vscode';
import { ConfigureCommand } from '@/commands/configure';
import type { Project } from '@/types/base';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

function projectOnPort(status: 'running' | 'stopped'): Project {
    return createMockProject({
        path: '/projects/port-demo',
        componentInstances: {
            'citisignal-nextjs': {
                id: 'citisignal-nextjs',
                name: 'Storefront',
                type: 'frontend',
                status,
                port: 3000,
            },
        },
    });
}

async function changePortTo3001(project: Project, answer: string | undefined): Promise<void> {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value: 'port' });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('3001');
    (vscode.window.showInformationMessage as jest.Mock).mockImplementation(
        async (message: string) =>
            message === 'Restart the demo to apply the port change' ? answer : undefined
    );
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    await new ConfigureCommand(
        createMockExtensionContext(),
        stateManager,
        createMockLogger()
    ).execute();
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
});

describe('Change Frontend Port, then Restart Now', () => {
    it('runs the one restart, for the project whose port changed', async () => {
        await changePortTo3001(projectOnPort('running'), 'Restart Now');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.restartDemo',
            '/projects/port-demo'
        );
        const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(([id]) => id);
        expect(ids).not.toContain('demoBuilder.stopDemo');
        expect(ids).not.toContain('demoBuilder.startDemo');
    });

    it('restarts nothing when the SC does not choose Restart Now', async () => {
        await changePortTo3001(projectOnPort('running'), undefined);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'demoBuilder.restartDemo',
            expect.anything()
        );
    });

    it('says so when the restart fails', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('port in use'));

        await changePortTo3001(projectOnPort('running'), 'Restart Now');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to restart demo: port in use',
            'OK'
        );
    });
});
