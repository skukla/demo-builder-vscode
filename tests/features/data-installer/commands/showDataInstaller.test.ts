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
import { importHandlers } from '@/features/data-installer/handlers';
import type { DataInstallerInitialData } from '@/types/webviewPayloads';
import * as vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import type { StateManager } from '@/core/state';

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

function makeStateManager(): ReturnType<typeof createMockStateManager> {
    return createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(null) });
}

const logger = createMockLogger();

/** Reach the protected members the way a subclass test must. */
type Internals = {
    getWebviewId(): string;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
    getInitialData(): Promise<DataInstallerInitialData>;
    initializeMessageHandlers(comm: { onStreaming: jest.Mock }): void;
};

function makeCommand(): ShowDataInstallerCommand & Internals {
    return new ShowDataInstallerCommand(
        makeExtensionContext(),
        makeStateManager() as unknown as StateManager,
        logger as never
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
            // BOTH maps. They stay separate because the read map is what the MCP
            // descriptors mirror — writes are deliberately not agent-exposed — but
            // the panel needs every type, so the command registers the union.
            //
            // Plus `open-data-installer-settings`, which is in NEITHER map on
            // purpose: it opens a VS Code pane, so it has no business in the read
            // map the MCP descriptors mirror. Named here rather than derived,
            // because being outside both maps is the whole point of it.
            expect(registered).toEqual(
                [
                    ...getRegisteredTypes(dataInstallerHandlers),
                    ...getRegisteredTypes(importHandlers),
                    'open-data-installer-settings',
                ].sort()
            );
        });

        /**
         * The refusal's own fix. Unregistered, the "Open Settings" button on the
         * configuration failure would be a silent no-op — and that failure is the
         * FIRST thing an unconfigured install sees, because `apiBaseUrl` ships
         * with no default.
         */
        it('registers the settings action the configuration refusal offers', () => {
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);

            const registered = comm.onStreaming.mock.calls.map((call) => call[0]);
            expect(registered).toContain('open-data-installer-settings');
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
