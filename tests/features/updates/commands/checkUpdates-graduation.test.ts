/**
 * CheckUpdatesCommand - Early-Access Graduation Off-Ramp
 *
 * Verifies the prompt-only off-ramp: when on early-access and running an
 * -alpha.* build superseded by a final release, the user is offered a channel
 * switch, and the setting is written only on an explicit choice.
 */

import * as vscode from 'vscode';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import type { Logger } from '@/core/logging';
import type { StateManager } from '@/core/state';

jest.mock('vscode', () => ({
    window: {
        withProgress: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showQuickPick: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn(),
    },
    ProgressLocation: { Notification: 15 },
    QuickPickItemKind: { Separator: 1 },
    ConfigurationTarget: { Global: 1 },
}));

jest.mock('@/features/updates/services/updateManager');
jest.mock('@/features/updates/services/componentUpdater');
jest.mock('@/features/updates/services/extensionUpdater');

describe('CheckUpdatesCommand - Graduation Off-Ramp', () => {
    let command: CheckUpdatesCommand;
    let mockContext: any;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockConfigUpdate: jest.Mock;

    function setChannel(channel: string): void {
        mockConfigUpdate = jest.fn();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, def?: any) => (key === 'updateChannel' ? channel : def)),
            update: mockConfigUpdate,
        });
    }

    function mockUpdates(opts: { installed: string; latestFinal: string | null }): void {
        const mgr = UpdateManager as jest.MockedClass<typeof UpdateManager>;
        mgr.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
            hasUpdate: false,
            current: opts.installed,
            latest: opts.installed,
        });
        mgr.prototype.checkAllProjectsForUpdates = jest.fn().mockResolvedValue([]);
        mgr.prototype.getLatestFinalVersion = jest.fn().mockResolvedValue(opts.latestFinal);
    }

    async function run(): Promise<void> {
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockContext = {
            subscriptions: [],
            secrets: { get: jest.fn() },
            globalState: { get: jest.fn(), update: jest.fn() },
        };
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            getAllProjects: jest.fn().mockResolvedValue([]),
            loadProjectFromPath: jest.fn().mockResolvedValue(null),
        } as any;
        mockLogger = {
            info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
        } as any;

        (vscode.window.withProgress as jest.Mock).mockImplementation((_o, cb) => cb({ report: jest.fn() }));

        command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('offers the off-ramp when a final supersedes the installed alpha', async () => {
        setChannel('early-access');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '2.0.0' });
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Stay');

        await run();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('supersedes'),
            'Switch to Beta',
            'Switch to Stable',
            'Stay',
        );
    });

    it('switches to beta when the user chooses "Switch to Beta"', async () => {
        setChannel('early-access');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '2.0.0' });
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch to Beta');

        await run();

        expect(mockConfigUpdate).toHaveBeenCalledWith('updateChannel', 'beta', vscode.ConfigurationTarget.Global);
    });

    it('switches to stable when the user chooses "Switch to Stable"', async () => {
        setChannel('early-access');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '2.0.0' });
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch to Stable');

        await run();

        expect(mockConfigUpdate).toHaveBeenCalledWith('updateChannel', 'stable', vscode.ConfigurationTarget.Global);
    });

    it('writes nothing when the user chooses "Stay"', async () => {
        setChannel('early-access');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '2.0.0' });
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Stay');

        await run();

        expect(mockConfigUpdate).not.toHaveBeenCalled();
    });

    it('does not prompt when the user is not on early-access', async () => {
        setChannel('beta');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '2.0.0' });

        await run();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockConfigUpdate).not.toHaveBeenCalled();
    });

    it('does not prompt when no final supersedes the installed alpha', async () => {
        setChannel('early-access');
        mockUpdates({ installed: '2.0.0-alpha.5', latestFinal: '1.9.0' });

        await run();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
});
