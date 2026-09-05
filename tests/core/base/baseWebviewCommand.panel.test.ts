/**
 * The panel half of BaseWebviewCommand: opening one, revealing the one that is
 * already open, and answering whether it is on screen.
 *
 * The singleton is the whole point. A second panel for the same webview id is
 * the bug this class exists to prevent — two tabs, two comm managers, and a
 * user editing a project in one while the other holds stale state.
 */
import {
    makeCommand,
    mintedPanels,
    resetMintedPanels,
    createCommFake,
    useCommFake,
    type MintedPanel,
} from './baseWebviewCommand.testUtils';

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { WebviewPanelManager } from '@/core/base/webviewPanelManager';

const ID = 'test-webview';

/** Leave no panel or manager registered for the next spec. */
function clearRegistry(): void {
    WebviewPanelManager.unregisterPanel(ID);
    WebviewPanelManager.unregisterCommunicationManager(ID);
}

describe('BaseWebviewCommand panels', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetMintedPanels();
        clearRegistry();
        useCommFake(createCommFake());
    });

    afterEach(clearRegistry);

    describe('creating one', () => {
        it('opens the panel with scripts enabled and its context retained', async () => {
            const { command } = makeCommand();

            await command.openPanel();

            const [id, title, column, options] = (vscode.window.createWebviewPanel as jest.Mock).mock
                .calls[0];
            expect(id).toBe(ID);
            expect(title).toBe('Test Webview');
            expect(column).toBe(vscode.ViewColumn.One);
            // Scripts: the webview is a React bundle. Retained context: losing it
            // resets the user's place every time they switch tabs.
            expect(options.enableScripts).toBe(true);
            expect(options.retainContextWhenHidden).toBe(true);
        });

        /**
         * The webview may only load files from these three roots. An empty list
         * is a panel that renders nothing, with no error anywhere.
         */
        it('grants access to the bundle, the built media and the shipped media', async () => {
            const { command } = makeCommand();

            await command.openPanel();

            const { localResourceRoots } = (vscode.window.createWebviewPanel as jest.Mock).mock
                .calls[0][3];
            expect(localResourceRoots.map((u: { fsPath: string }) => u.fsPath)).toEqual([
                '/test/dist/webview',
                '/test/dist/media',
                '/test/media',
            ]);
        });

        it('registers the panel so other features can find it by id', async () => {
            const { command } = makeCommand();

            const panel = await command.openPanel();

            expect(BaseWebviewCommand.getActivePanel(ID)).toBe(panel);
            expect(BaseWebviewCommand.getActivePanelCount()).toBe(1);
        });

        /**
         * A singleton command is reopened after it was disposed. A store that is
         * still closed does not refuse a late addition — it disposes it on the
         * spot — so the resource is gone the moment it is registered and the
         * second life of the panel has no listeners at all.
         */
        it('reuses a disposable store that a previous dispose had closed', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            command.dispose();

            await command.openPanel();
            const laterDisposable = { dispose: jest.fn() };
            command.getDisposablesForTest().add(laterDisposable);

            expect(laterDisposable.dispose).not.toHaveBeenCalled();

            command.dispose();
            expect(laterDisposable.dispose).toHaveBeenCalled();
        });

        it('keeps disposables registered before the panel was opened', async () => {
            const { command } = makeCommand();
            const earlyDisposable = { dispose: jest.fn() };
            command.getDisposablesForTest().add(earlyDisposable);

            await command.openPanel();
            command.dispose();

            // Resetting the store unconditionally would have dropped this one.
            expect(earlyDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('revealing the one already open', () => {
        it('reveals the existing panel instead of opening a second', async () => {
            const { command } = makeCommand();
            const first = await command.openPanel();

            const second = await command.openPanel();

            expect(second).toBe(first);
            expect(mintedPanels()).toHaveLength(1);
            expect((first as unknown as MintedPanel).reveal).toHaveBeenCalled();
        });

        /**
         * A revealed panel is showing whatever it last rendered. Without fresh
         * initial data the user is looking at the project they had two projects
         * ago.
         */
        it('pushes fresh initial data through the comm manager it finds', async () => {
            const comm = createCommFake();
            useCommFake(comm);
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            comm.sendMessage.mockClear();

            await command.openPanel();

            expect(comm.sendMessage).toHaveBeenCalledWith('init', { test: true });
        });

        it('reveals without sending anything when no comm manager is registered yet', async () => {
            const comm = createCommFake();
            useCommFake(comm);
            const { command } = makeCommand();
            await command.openPanel();

            await command.openPanel();

            expect(mintedPanels()).toHaveLength(1);
            expect(comm.sendMessage).not.toHaveBeenCalled();
        });

        /**
         * VS Code disposes panels behind the extension's back. `reveal()` then
         * throws, and the registration left behind would keep pointing at a dead
         * panel forever.
         */
        it('drops the stale registrations and opens a new panel when reveal throws', async () => {
            const comm = createCommFake();
            useCommFake(comm);
            const { command } = makeCommand();
            await command.openPanel();
            await command.startCommunication();
            mintedPanels()[0].reveal.mockImplementation(() => {
                throw new Error('Webview is disposed');
            });

            await command.openPanel();

            expect(mintedPanels()).toHaveLength(2);
            expect(BaseWebviewCommand.getActivePanel(ID)).toBe(mintedPanels()[1]);
            // The manager belonged to the dead panel. Leaving it registered
            // would hand it to the next reveal as though it still worked.
            expect(WebviewPanelManager.getActiveCommunicationManager(ID)).toBeUndefined();
        });
    });

    /**
     * Reading `.visible` on a disposed panel throws, which is why every branch
     * here sits inside one try. Two references are consulted because they can
     * disagree: the registry may hold a panel this instance never saw.
     */
    describe('isVisible', () => {
        it('is false when nothing is open', () => {
            const { command } = makeCommand();

            expect(command.isVisible()).toBe(false);
        });

        it('is true for a visible panel this instance opened', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            expect(command.isVisible()).toBe(true);
        });

        it('is false when the panel it opened is hidden', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            mintedPanels()[0].visible = false;

            expect(command.isVisible()).toBe(false);
        });

        // The registry knows about a panel this instance never opened — another
        // command owns it, and it is still on screen.
        it('is true for a registered panel this instance never opened', async () => {
            const { command: owner } = makeCommand();
            await owner.openPanel();
            const { command: other } = makeCommand();

            expect(other.currentPanel()).toBeUndefined();
            expect(other.isVisible()).toBe(true);
        });

        it('is false when the registered panel it never opened is hidden', async () => {
            const { command: owner } = makeCommand();
            await owner.openPanel();
            mintedPanels()[0].visible = false;
            const { command: other } = makeCommand();

            expect(other.isVisible()).toBe(false);
        });

        // Its own reference is still live after the registry has let go.
        it('is true for its own visible panel after the registry has dropped it', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            WebviewPanelManager.unregisterPanel(ID);

            expect(command.isVisible()).toBe(true);
        });

        it('is false — not a thrown error — when the panel was disposed underneath it', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            Object.defineProperty(mintedPanels()[0], 'visible', {
                get() {
                    throw new Error('Webview is disposed');
                },
            });

            expect(command.isVisible()).toBe(false);
        });
    });

    describe('closing panels by id', () => {
        it('disposes the panel registered under that id', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            BaseWebviewCommand.disposePanel(ID);

            expect(mintedPanels()[0].dispose).toHaveBeenCalled();
        });

        it('does nothing when no panel is open under that id', () => {
            expect(() => BaseWebviewCommand.disposePanel('nobody-opened-this')).not.toThrow();
        });

        // Already-disposed is the expected case, not an error to report.
        it('stays quiet when the panel refuses to dispose twice', async () => {
            const { command } = makeCommand();
            await command.openPanel();
            mintedPanels()[0].dispose.mockImplementation(() => {
                throw new Error('Webview is disposed');
            });

            expect(() => BaseWebviewCommand.disposePanel(ID)).not.toThrow();
        });

        it('disposes every open panel at once', async () => {
            const { command } = makeCommand();
            await command.openPanel();

            BaseWebviewCommand.disposeAllActivePanels();

            expect(mintedPanels()[0].dispose).toHaveBeenCalled();
            expect(BaseWebviewCommand.getActivePanelCount()).toBe(0);
        });
    });
});
