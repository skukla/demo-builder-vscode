/**
 * Tests for the Data Installer panel command.
 *
 * The load-bearing assertion is that `initializeMessageHandlers` registers EVERY
 * type in the handler map. An unregistered type is silence, not an error — the
 * webview request never resolves and hangs to its timeout — so this is pinned
 * against `getRegisteredTypes` rather than a hand-written list, which means Stage 2
 * and 3 message types are covered the moment they join the map.
 */

import { ShowDataInstallerCommand } from '@/features/data-installer/commands/showDataInstaller';
import { dataInstallerHandlers } from '@/features/data-installer/handlers';
import { getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import * as vscode from 'vscode';

jest.mock('@/core/communication/webviewCommunicationManager');

/** Minimal ExtensionContext — only what BaseWebviewCommand reaches for. */
function makeExtensionContext(): vscode.ExtensionContext {
    return {
        extensionPath: '/ext',
        subscriptions: [],
        globalState: { get: jest.fn(), update: jest.fn() },
        workspaceState: { get: jest.fn(), update: jest.fn() },
        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() },
    } as unknown as vscode.ExtensionContext;
}

function makeStateManager(): { getCurrentProject: jest.Mock } {
    return { getCurrentProject: jest.fn().mockResolvedValue(null) };
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

/** Reach the protected members the way a subclass test must. */
type Internals = {
    getWebviewId(): string;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
    getInitialData(): Promise<Record<string, unknown>>;
    initializeMessageHandlers(comm: { onStreaming: jest.Mock }): void;
};

function makeCommand(): ShowDataInstallerCommand & Internals {
    return new ShowDataInstallerCommand(
        makeExtensionContext(),
        makeStateManager() as never,
        logger as never,
    ) as ShowDataInstallerCommand & Internals;
}

describe('ShowDataInstallerCommand', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('panel identity', () => {
        it('uses a stable webview id', () => {
            expect(makeCommand().getWebviewId()).toBe('demoBuilder.dataInstaller');
        });

        it('titles the panel for humans', () => {
            expect(makeCommand().getWebviewTitle()).toBe('Data Installer');
        });

        it('has a loading message', () => {
            expect(makeCommand().getLoadingMessage()).toMatch(/data installer/i);
        });
    });

    describe('message registration', () => {
        it('registers EVERY type in the handler map', () => {
            // Pinned against the map, not a literal list: an unregistered type
            // hangs the request instead of erroring, and later stages add types.
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);

            const registered = comm.onStreaming.mock.calls.map((call) => call[0]).sort();
            expect(registered).toEqual([...getRegisteredTypes(dataInstallerHandlers)].sort());
        });

        it('registers at least the six Stage 1 types', () => {
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);
            expect(comm.onStreaming.mock.calls.length).toBeGreaterThanOrEqual(6);
        });

        it('registers a handler function for each type', () => {
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);
            for (const [, handler] of comm.onStreaming.mock.calls) {
                expect(typeof handler).toBe('function');
            }
        });
    });

    describe('initial data', () => {
        it('carries the theme so the webview paints correctly on first frame', async () => {
            const data = await makeCommand().getInitialData();
            expect(['dark', 'light']).toContain(data.theme);
        });

        it('does NOT require a project — the catalog is not project-scoped', async () => {
            // getCurrentProject resolves null here; this must still succeed.
            await expect(makeCommand().getInitialData()).resolves.toBeDefined();
        });
    });

    describe('disposeActivePanel', () => {
        it('is safe to call when no panel exists', () => {
            expect(() => ShowDataInstallerCommand.disposeActivePanel()).not.toThrow();
        });
    });
});
