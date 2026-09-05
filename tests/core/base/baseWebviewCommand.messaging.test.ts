/**
 * Everything BaseWebviewCommand does once a panel exists: standing up the
 * communication manager, the handlers every webview gets for free, and what
 * happens on the way out.
 *
 * The standard handlers are the interesting part. They are registered as
 * callbacks and never invoked by the command itself, so a fake that only
 * records "on was called" proves nothing about them — the comm fake here hands
 * each handler back so the spec can run it.
 */
import {
    makeCommand,
    mintedPanels,
    resetMintedPanels,
    createCommFake,
    useCommFake,
    ReopeningWebviewCommand,
    type CommFake,
} from './baseWebviewCommand.testUtils';

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { WebviewPanelManager } from '@/core/base/webviewPanelManager';
import { createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
import { setLoadingState } from '@/core/utils/loadingHTML';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const ID = 'test-webview';

function clearRegistry(): void {
    WebviewPanelManager.unregisterPanel(ID);
    WebviewPanelManager.unregisterCommunicationManager(ID);
}

/** The theme callback the command handed to VS Code. */
function themeListener(): (theme: { kind: number }) => void {
    return (vscode.window.onDidChangeActiveColorTheme as jest.Mock).mock.calls[0][0];
}

describe('BaseWebviewCommand communication', () => {
    let comm: CommFake;

    beforeEach(() => {
        jest.clearAllMocks();
        resetMintedPanels();
        clearRegistry();
        comm = createCommFake();
        useCommFake(comm);
        BaseWebviewCommand.setDisposalCallback(jest.fn());
    });

    afterEach(clearRegistry);

    describe('standing it up', () => {
        it('refuses to start without a panel, rather than talking to nothing', async () => {
            const { command } = makeCommand();

            await expect(command.startCommunication()).rejects.toThrow(
                'Panel must be created before initializing communication',
            );
        });

        /**
         * The loading screen names what is loading. An anonymous spinner is the
         * same screen for a wizard, a dashboard and a failure.
         */
        it('shows the loading screen with the page identity before connecting', async () => {
            const { command, logger } = makeCommand();
            await command.openPanel();

            await command.startCommunication();

            const [panel, , message, log, header] = (setLoadingState as jest.Mock).mock.calls[0];
            expect(panel).toBe(mintedPanels()[0]);
            expect(message).toBe('Loading...');
            expect(log).toBe(logger);
            expect(header).toEqual({ title: 'Test Webview' });
        });

        it('lets a subclass replace the loading header entirely', async () => {
            const { command } = makeCommand();
            command.loadingHeaderOverride = { title: 'Bodea', subtitle: 'demo project' };
            await command.openPanel();

            await command.startCommunication();

            expect((setLoadingState as jest.Mock).mock.calls[0][4]).toEqual({
                title: 'Bodea',
                subtitle: 'demo project',
            });
        });

        it('connects with the shared timeouts and a retry budget', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            await command.startCommunication();

            expect(createWebviewCommunication).toHaveBeenCalledWith(mintedPanels()[0], {
                enableLogging: true,
                handshakeTimeout: TIMEOUTS.NORMAL,
                messageTimeout: TIMEOUTS.NORMAL,
                maxRetries: 3,
            });
        });

        it('registers the manager so a later reveal can find it', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            await command.startCommunication();

            expect(WebviewPanelManager.getActiveCommunicationManager(ID)).toBe(comm);
        });

        it('sends the initial data once the handlers are in place', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            await command.startCommunication();

            expect(comm.sendMessage).toHaveBeenCalledWith('init', { test: true });
        });

        it('registers the subclass handlers alongside the standard ones', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            await command.startCommunication();

            expect(Object.keys(comm.handlers).sort()).toEqual([
                'get-state',
                'log',
                'subclass-handler',
                'update-state',
            ]);
        });

        /**
         * An orphaned manager keeps its own `onDidReceiveMessage` subscription,
         * so every webview message would be handled twice.
         */
        it('disposes a manager left over from a previous start', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            const orphan = comm;

            useCommFake(createCommFake());
            await command.startCommunication();

            expect(orphan.dispose).toHaveBeenCalled();
        });
    });

    describe('the handlers every webview gets', () => {
        beforeEach(async () => {
            const made = makeCommand();
            currentCommand = made.command;
            currentLogger = made.logger;
            currentState = made.stateManager;
            await currentCommand.openPanel();
            await currentCommand.startCommunication();
        });

        let currentCommand: ReturnType<typeof makeCommand>['command'];
        let currentLogger: ReturnType<typeof makeCommand>['logger'];
        let currentState: ReturnType<typeof makeCommand>['stateManager'];

        // Routing only — which level the webview asked for decides which channel
        // it lands on. What the line SAYS is not this class's business.
        it.each([
            ['error', 'error'],
            ['warn', 'warn'],
            ['debug', 'debug'],
            ['info', 'info'],
            ['anything-else', 'info'],
        ])('routes a %s log line to logger.%s', (level, channel) => {
            (comm.handlers.log as (d: { level: string; message: string }) => void)({
                level,
                message: 'from the webview',
            });

            expect(currentLogger[channel as 'error' | 'warn' | 'debug' | 'info']).toHaveBeenCalled();
        });

        it('answers get-state with the current project', async () => {
            const state = await (comm.handlers['get-state'] as () => Promise<unknown>)();

            expect(state).toEqual({ name: 'test-project' });
        });

        it('merges an update onto the current project and saves the whole thing', async () => {
            await (
                comm.handlers['update-state'] as (u: Record<string, unknown>) => Promise<unknown>
            )({ port: 3000 });

            expect(currentState.saveProject).toHaveBeenCalledWith({
                name: 'test-project',
                port: 3000,
            });
        });

        it('bumps the state version so the webview knows its copy is stale', async () => {
            const result = await (
                comm.handlers['update-state'] as (u: Record<string, unknown>) => Promise<unknown>
            )({ port: 3000 });

            expect(comm.incrementStateVersion).toHaveBeenCalled();
            expect(result).toEqual({ success: true, version: 7 });
        });

        it('survives an update that lands after the manager is gone', async () => {
            currentCommand.forgetComm();

            await expect(
                (comm.handlers['update-state'] as (u: Record<string, unknown>) => Promise<unknown>)(
                    { port: 3000 },
                ),
            ).resolves.toEqual({ success: true, version: undefined });
        });

        // Asserted as a sequence, not as two memberships: a listener that maps
        // both kinds the wrong way round still sends one of each.
        it('tells the webview to change theme when VS Code does', () => {
            themeListener()({ kind: vscode.ColorThemeKind.Dark });
            themeListener()({ kind: vscode.ColorThemeKind.Light });

            expect(
                comm.sendMessage.mock.calls.filter(([type]) => type === 'theme-changed'),
            ).toEqual([
                ['theme-changed', { theme: 'dark' }],
                ['theme-changed', { theme: 'light' }],
            ]);
        });

        it('ignores a theme change that arrives after the manager is gone', () => {
            currentCommand.forgetComm();

            expect(() => themeListener()({ kind: vscode.ColorThemeKind.Dark })).not.toThrow();
        });
    });

    describe('update-state with nothing loaded', () => {
        it('refuses rather than saving an update onto no project', async () => {
            const { command, stateManager } = makeCommand(null);
            await command.openPanel();
            await command.startCommunication();

            await expect(
                (comm.handlers['update-state'] as (u: Record<string, unknown>) => Promise<unknown>)(
                    { port: 3000 },
                ),
            ).rejects.toThrow('No project loaded');
            expect(stateManager.saveProject).not.toHaveBeenCalled();
        });
    });

    describe('sending', () => {
        it('passes the type and payload straight through', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();

            await command.send('progress', { step: 2 });

            expect(comm.sendMessage).toHaveBeenCalledWith('progress', { step: 2 });
        });

        // Disposal races every in-flight progress push. Throwing here would turn
        // a closed panel into an unhandled rejection.
        it('does nothing at all when there is no manager', async () => {
            const { command } = makeCommand();

            await expect(command.send('progress')).resolves.toBeUndefined();
            expect(comm.sendMessage).not.toHaveBeenCalled();
        });

        it('rethrows a send failure rather than swallowing it', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            comm.sendMessage.mockRejectedValueOnce(new Error('channel closed'));

            await expect(command.send('progress')).rejects.toThrow('channel closed');
        });
    });

    describe('asking', () => {
        it('returns what the webview answered', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            comm.request.mockResolvedValueOnce({ chosen: 'bodea' });

            await expect(command.ask('pick-one', { options: [] })).resolves.toEqual({
                chosen: 'bodea',
            });
            expect(comm.request).toHaveBeenCalledWith('pick-one', { options: [] });
        });

        // Unlike a send, a request has a caller waiting on an answer, so silence
        // would hang it.
        it('fails loudly when there is no manager', async () => {
            const { command } = makeCommand();

            await expect(command.ask('pick-one')).rejects.toThrow('Communication not initialized');
        });

        it('rethrows a request failure', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            comm.request.mockRejectedValueOnce(new Error('timed out'));

            await expect(command.ask('pick-one')).rejects.toThrow('timed out');
        });
    });

    /**
     * Closing a webview may have to open Welcome behind it, so the user is not
     * left staring at an empty editor. Only webviews that ask for it.
     */
    describe('reopening Welcome on the way out', () => {
        // The callback is deferred by one tick so disposal finishes first.
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('calls back with the webview id for a webview that asked', async () => {
            const callback = jest.fn();
            BaseWebviewCommand.setDisposalCallback(callback);
            const { command } = makeCommand({ name: 'p' }, ReopeningWebviewCommand);
            await command.openPanel();

            command.dispose();
            jest.advanceTimersByTime(TIMEOUTS.UI.UPDATE_DELAY);

            expect(callback).toHaveBeenCalledWith(ID);
        });

        // The default, and the reason the flag exists.
        it('does not call back for a webview that did not ask', async () => {
            const callback = jest.fn();
            BaseWebviewCommand.setDisposalCallback(callback);
            const { command } = makeCommand();
            await command.openPanel();

            command.dispose();
            jest.advanceTimersByTime(TIMEOUTS.UI.UPDATE_DELAY);

            expect(callback).not.toHaveBeenCalled();
        });
    });

    /**
     * The nonce is what makes the CSP hold. A predictable one is a CSP that
     * blocks nothing.
     */
    describe('the CSP nonce', () => {
        it('is base64 and long enough to be unguessable', () => {
            const { command } = makeCommand();

            expect(command.nonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        });

        it('is different every time', () => {
            const { command } = makeCommand();

            expect(command.nonce()).not.toBe(command.nonce());
        });
    });
});
