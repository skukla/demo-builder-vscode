/**
 * Tests for the Data Installer panel command.
 *
 * The load-bearing assertion is that `initializeMessageHandlers` registers EVERY
 * type in the handler map. An unregistered type is silence, not an error — the
 * webview request never resolves and hangs to its timeout — so this is pinned
 * against `getRegisteredTypes` rather than a hand-written list, which means Stage 2
 * and 3 message types are covered the moment they join the map.
 */

jest.mock('@/core/handlers/dispatchHandler', () => ({
    ...jest.requireActual('@/core/handlers/dispatchHandler'),
    dispatchHandler: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/core/utils/bundleUri', () => ({
    getBundleUri: jest.fn(() => 'vscode-webview://bundle.js'),
}));
jest.mock('@/core/utils/getWebviewHTMLWithBundles', () => ({
    getWebviewHTML: jest.fn(() => '<html>data installer</html>'),
}));
jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ marker: 'panel-context' })),
}));

import { ShowDataInstallerCommand } from '@/features/data-installer/commands/showDataInstaller';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { handleOpenDataInstallerSettings } from '@/features/data-installer/handlers/settingsHandlers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { DataInstallerInitialData } from '@/types/webviewPayloads';
import * as vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import type { StateManager } from '@/core/state/stateManager';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

jest.mock('@/core/communication/webviewCommunicationManager');

/** Minimal ExtensionContext — only what BaseWebviewCommand reaches for. */
function makeExtensionContext(): vscode.ExtensionContext {
    return createMockExtensionContext();
}

function makeStateManager(): ReturnType<typeof createMockStateManager> {
    return createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(null) });
}

const logger = createMockLogger();

/** `activeColorTheme` is readonly on the real API, so replace the whole object. */
function themeIs(kind: vscode.ColorThemeKind): void {
    Object.defineProperty(vscode.window, 'activeColorTheme', {
        value: { kind },
        configurable: true,
    });
}

/** Reach the protected members the way a subclass test must. */
type Internals = {
    getWebviewId(): string;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
    getInitialData(): Promise<DataInstallerInitialData>;
    initializeMessageHandlers(comm: { onStreaming: jest.Mock }): void;
    getWebviewContent(): Promise<string>;
    createOrRevealPanel(): Promise<unknown>;
    initializeCommunication(): Promise<unknown>;
    sendMessage(type: string, payload?: unknown): Promise<void>;
    panel: vscode.WebviewPanel | undefined;
    communicationManager: WebviewCommunicationManager | undefined;
};

function makeCommand(): ShowDataInstallerCommand & Internals {
    return new ShowDataInstallerCommand(
        makeExtensionContext(),
        makeStateManager() as unknown as StateManager,
        logger
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

        it('dispatches a registered type into the map it came from', async () => {
            // The MAP is the dispatch authority, and the two are kept separate on
            // purpose — read types are mirrored by the MCP descriptors, writes are
            // not. A callback closed over the wrong one would still answer.
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);

            const type = getRegisteredTypes(dataInstallerHandlers)[0];
            const [, handler] = comm.onStreaming.mock.calls.find((c) => c[0] === type)!;

            const result = await handler({ page: 2 });

            expect(dispatchHandler).toHaveBeenCalledWith(
                dataInstallerHandlers,
                { marker: 'panel-context' },
                type,
                { page: 2 }
            );
            expect(result).toEqual({ success: true });
        });

        it('dispatches the settings action into its own one-entry map', async () => {
            // It belongs to NEITHER handler map, so the map it dispatches into is
            // built at the call site and nothing else would catch it being wrong.
            const comm = { onStreaming: jest.fn() };
            makeCommand().initializeMessageHandlers(comm);

            const [, handler] = comm.onStreaming.mock.calls.find(
                (c) => c[0] === 'open-data-installer-settings'
            )!;
            await handler(undefined);

            expect(dispatchHandler).toHaveBeenCalledWith(
                { 'open-data-installer-settings': handleOpenDataInstallerSettings },
                { marker: 'panel-context' },
                'open-data-installer-settings',
                undefined
            );
        });

        it('builds the handler context from the panel this command owns', async () => {
            const command = makeCommand();
            const panel = createMockWebviewPanel();
            command.panel = panel;
            const comm = { onStreaming: jest.fn() };
            command.initializeMessageHandlers(comm);

            await comm.onStreaming.mock.calls[0][1](undefined);

            expect(createPanelHandlerContext).toHaveBeenCalledWith(
                expect.objectContaining({ panel, context: command['context'] })
            );
        });

        it('gives the context a sendMessage that reaches this command', async () => {
            const command = makeCommand();
            const send = jest.spyOn(command, 'sendMessage').mockResolvedValue(undefined);
            const comm = { onStreaming: jest.fn() };
            command.initializeMessageHandlers(comm);
            await comm.onStreaming.mock.calls[0][1](undefined);

            const { sendMessage } = (createPanelHandlerContext as jest.Mock).mock.calls[0][0];
            await sendMessage('progress', { done: 1 });

            expect(send).toHaveBeenCalledWith('progress', { done: 1 });
        });
    });

    describe('webview content', () => {
        it('refuses to build content before the panel exists', async () => {
            await expect(makeCommand().getWebviewContent()).rejects.toThrow(
                'Panel must be created before getting webview content'
            );
        });

        it('points the page at this feature’s own bundle', async () => {
            const command = makeCommand();
            const panel = createMockWebviewPanel();
            command.panel = panel;

            const html = await command.getWebviewContent();

            expect(getBundleUri).toHaveBeenCalledWith({
                webview: panel.webview,
                extensionPath: command['context'].extensionPath,
                featureBundleName: 'dataInstaller',
            });
            expect(html).toBe('<html>data installer</html>');
        });

        it('passes NO baseUri — remote cover art needs img-src, not a local base', async () => {
            const command = makeCommand();
            command.panel = createMockWebviewPanel();

            await command.getWebviewContent();

            const options = (getWebviewHTML as jest.Mock).mock.calls[0][0];
            expect(options).toEqual({
                scriptUri: 'vscode-webview://bundle.js',
                nonce: expect.any(String),
                cspSource: 'vscode-webview:',
                title: 'Data Installer',
            });
        });
    });

    describe('execute', () => {
        it('opens the panel and wires communication the first time', async () => {
            const command = makeCommand();
            const createOrReveal = jest
                .spyOn(command, 'createOrRevealPanel')
                .mockResolvedValue(undefined);
            const initComm = jest
                .spyOn(command, 'initializeCommunication')
                .mockResolvedValue(undefined);

            await command.execute();

            expect(createOrReveal).toHaveBeenCalledTimes(1);
            expect(initComm).toHaveBeenCalledTimes(1);
        });

        it('reveals an already-wired panel without rebuilding its channel', async () => {
            // Re-initialising would replace the channel under a webview that is
            // still holding the old one, so every in-flight request would hang.
            const command = makeCommand();
            jest.spyOn(command, 'createOrRevealPanel').mockResolvedValue(undefined);
            const initComm = jest
                .spyOn(command, 'initializeCommunication')
                .mockResolvedValue(undefined);
            // The automocked class — a real instance of the type execute() reads,
            // not a literal cast into its shape.
            command.communicationManager = new WebviewCommunicationManager(
                createMockWebviewPanel()
            );

            await command.execute();

            expect(initComm).not.toHaveBeenCalled();
        });
    });

    describe('initial data', () => {
        it('reports a dark VS Code theme as dark', async () => {
            themeIs(vscode.ColorThemeKind.Dark);
            expect((await makeCommand().getInitialData()).theme).toBe('dark');
        });

        it('reports every other VS Code theme as light', async () => {
            themeIs(vscode.ColorThemeKind.HighContrast);
            expect((await makeCommand().getInitialData()).theme).toBe('light');
        });

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

        it('closes THIS surface, named by its own webview id', () => {
            // The id is the whole argument. Passing another surface's would close
            // the dashboard when a sibling asked for the Data Installer.
            const disposePanel = jest
                .spyOn(BaseWebviewCommand, 'disposePanel')
                .mockImplementation(() => undefined);

            ShowDataInstallerCommand.disposeActivePanel();

            expect(disposePanel).toHaveBeenCalledWith('demoBuilder.dataInstaller');
            disposePanel.mockRestore();
        });
    });
});
