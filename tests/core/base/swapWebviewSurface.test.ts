/**
 * swapWebviewSurface — close one surface and open another in its place. A command may carry
 * arguments, which is how the creation end screen's Finish Setup asks the dashboard to open
 * on its guide (PL-101).
 */

jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
        endWebviewTransition: jest.fn(),
        getActivePanel: jest.fn(),
    },
}));

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { swapWebviewSurface } from '@/core/base/swapWebviewSurface';

const executeCommand = vscode.commands.executeCommand as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('swapWebviewSurface', () => {
    it('closes the panel, then runs each command in order, a bare id without arguments', async () => {
        const dispose = jest.fn();
        (BaseWebviewCommand.getActivePanel as jest.Mock).mockReturnValue({ dispose });

        await swapWebviewSurface('wizard', 'demoBuilder.showProjectDashboard', 'demoBuilder.configure');

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(executeCommand.mock.calls).toStrictEqual([
            ['demoBuilder.showProjectDashboard'],
            ['demoBuilder.configure'],
        ]);
        expect(BaseWebviewCommand.endWebviewTransition).toHaveBeenCalledTimes(1);
    });

    it('runs a command with the arguments it carries', async () => {
        await swapWebviewSurface('wizard', {
            id: 'demoBuilder.showProjectDashboard',
            args: [{ openFinishSetup: true }],
        });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectDashboard', {
            openFinishSetup: true,
        });
    });
});
