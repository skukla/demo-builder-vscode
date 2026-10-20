/**
 * CheckUpdatesCommand (PL-80) — Check for Updates checks in a notification, says when
 * nothing is waiting, and otherwise hands its check to the Updates modal on the projects
 * list. The background check (sidebar opening, every four hours) checks quietly and only
 * notifies, with Review opening the modal on that check. Nothing opens by itself, and the
 * modal never checks again.
 *
 * Both forms first run the early-access off-ramp: a preview build a final release has
 * superseded is offered a channel switch, written only on an explicit choice.
 */

import * as vscode from 'vscode';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/updates/services/updateManager');

const mockFindAllUpdates = jest.fn();
jest.mock('@/features/updates/services/allUpdates', () => ({
    findAllUpdates: (...args: unknown[]) => mockFindAllUpdates(...args),
}));
jest.mock('@/features/ai/server/headlessHandlerContext', () => ({
    createHeadlessHandlerContext: jest.fn(() => ({ marker: 'headless' })),
}));
jest.mock('@/features/dashboard/handlers/integrationUpdateHandlers', () => ({
    integrationUpdateProbe: jest.fn(() => ({ marker: 'probe' })),
}));
const mockPresentUpdates = jest.fn();
jest.mock('@/features/updates/handlers/updatesModalHandlers', () => ({
    presentUpdates: (...args: unknown[]) => mockPresentUpdates(...args),
}));

const executeCommand = vscode.commands.executeCommand as jest.Mock;
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;

function command(): CheckUpdatesCommand {
    const logger: Logger = createMockLogger();
    return new CheckUpdatesCommand(createMockExtensionContext(), createMockStateManager(), logger);
}

const OPEN_MODAL = ['demoBuilder.showProjectsList', { showUpdates: true }];

beforeEach(() => {
    jest.clearAllMocks();
    mockFindAllUpdates.mockReset();
    mockFindAllUpdates.mockResolvedValue({ count: 0 });
    showInformationMessage.mockReset();
    // The check's notification runs its work straight through.
    (vscode.window.withProgress as jest.Mock).mockImplementation((_options, task) => task({ report: jest.fn() }));
    // Not on early-access, so the off-ramp never asks.
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_key: string, fallback?: unknown) => fallback),
        update: jest.fn(),
    });
});

describe('CheckUpdatesCommand', () => {
    describe('run by the SC', () => {
        // The "up to date" message hides itself on a timer; run it on fake time.
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        async function runBySc(): Promise<void> {
            const running = command().execute();
            await jest.runAllTimersAsync();
            await running;
        }

        it('checks in a "Checking for updates" notification, with a headless context and the integration probe', async () => {
            await runBySc();

            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Checking for updates' }),
                expect.any(Function),
            );
            expect(mockFindAllUpdates).toHaveBeenCalledWith({ marker: 'headless' }, { marker: 'probe' });
        });

        it('says so when nothing is waiting, and opens nothing', async () => {
            await runBySc();

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                '✅ Demo Builder is up to date (v1.0.0)',
                expect.any(Number),
            );
            expect(mockPresentUpdates).not.toHaveBeenCalled();
            expect(executeCommand).not.toHaveBeenCalledWith(...OPEN_MODAL);
        });

        it('hands what it found to the Updates modal and opens it', async () => {
            const check = { count: 2 };
            mockFindAllUpdates.mockResolvedValue(check);

            await runBySc();

            expect(mockPresentUpdates).toHaveBeenCalledWith(check);
            expect(executeCommand).toHaveBeenCalledWith(...OPEN_MODAL);
            expect(mockPresentUpdates.mock.invocationCallOrder[0]).toBeLessThan(executeCommand.mock.invocationCallOrder[0]);
        });

        it('says the check failed when it throws, and opens nothing', async () => {
            mockFindAllUpdates.mockRejectedValue(new Error('rate limited'));

            await runBySc();

            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
            expect(executeCommand).not.toHaveBeenCalledWith(...OPEN_MODAL);
        });
    });

    describe('in the background', () => {
        it('checks with a headless context and the integration probe, and says nothing when nothing waits', async () => {
            mockFindAllUpdates.mockResolvedValue({ count: 0 });

            await command().execute({ background: true });

            expect(mockFindAllUpdates).toHaveBeenCalledWith({ marker: 'headless' }, { marker: 'probe' });
            expect(showInformationMessage).not.toHaveBeenCalled();
            expect(executeCommand).not.toHaveBeenCalled();
        });

        it('says how many are waiting, and opens the modal on that check only on Review', async () => {
            const check = { count: 3 };
            mockFindAllUpdates.mockResolvedValue(check);
            showInformationMessage.mockResolvedValue('Review');

            await command().execute({ background: true });

            expect(vscode.window.withProgress).not.toHaveBeenCalled();
            expect(showInformationMessage).toHaveBeenCalledWith('3 Demo Builder updates available.', 'Review');
            expect(mockPresentUpdates).toHaveBeenCalledWith(check);
            expect(executeCommand).toHaveBeenCalledWith(...OPEN_MODAL);
        });

        it('opens nothing when the notification is dismissed', async () => {
            mockFindAllUpdates.mockResolvedValue({ count: 1 });
            showInformationMessage.mockResolvedValue(undefined);

            await command().execute({ background: true });

            expect(showInformationMessage).toHaveBeenCalledWith('1 Demo Builder update available.', 'Review');
            expect(executeCommand).not.toHaveBeenCalled();
        });

        it('runs one check at a time', async () => {
            let finish!: (value: { count: number }) => void;
            mockFindAllUpdates.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            const cmd = command();

            const first = cmd.execute({ background: true });
            await cmd.execute({ background: true });
            finish({ count: 0 });
            await first;

            expect(mockFindAllUpdates).toHaveBeenCalledTimes(1);
        });
    });
});


describe('CheckUpdatesCommand - Graduation Off-Ramp', () => {
    let command: CheckUpdatesCommand;
    let mockContext: any;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockConfigUpdate: jest.Mock;

    function setChannel(channel: string): void {
        mockConfigUpdate = jest.fn();
        // Only the extension's own section answers: a read or a write aimed at any
        // other section finds no channel and reaches no update.
        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section?: string) =>
            section === 'demoBuilder'
                ? {
                    get: jest.fn((key: string, def?: any) => (key === 'updateChannel' ? channel : def)),
                    update: mockConfigUpdate,
                }
                : { get: jest.fn((_key: string, def?: any) => def), update: jest.fn() },
        );
    }

    function mockUpdates(opts: { installed: string; latestFinal: string | null }): void {
        // The installed version is the extension's own (PL-80), not the update check's.
        mockContext.extension = { packageJSON: { version: opts.installed } };
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
        mockStateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(null),
            getAllProjects: jest.fn().mockResolvedValue([]),
            loadProjectFromPath: jest.fn().mockResolvedValue(null),
        });
        mockLogger = createMockLogger();

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
            'A final release (v2.0.0) now supersedes your preview build (v2.0.0-alpha.5). '
            + 'Switch off the early-access channel to keep receiving updates?',
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
