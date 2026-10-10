/**
 * BundledPanelCommand — the page HTML and the handler context every bundled panel shares.
 *
 * Load-bearing: the bundle named by `bundleName` is the one the page loads; a
 * local-media base URI is added only for panels that ask for it (the wizard,
 * Configure and the Prompt Library had one, the rest did not); and the context
 * comes whole from the panel factory, with a shared state passed by reference
 * only when the panel has one.
 */

jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ marker: 'panel-context' })),
}));

import { BundledPanelCommand } from '@/commands/bundledPanelCommand';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import type { StateManager } from '@/core/state/stateManager';
import type { HandlerContext, SharedState } from '@/types/handlers';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../helpers/webviewPanelFake';

class PlainPanel extends BundledPanelCommand<Record<string, never>> {
    protected readonly bundleName = 'projectsList';
    protected getWebviewId(): string { return 'test.plain'; }
    protected getWebviewTitle(): string { return 'Plain Tab'; }
    protected initializeMessageHandlers(_comm: WebviewCommunicationManager): void { /* none */ }
    protected async getInitialData(): Promise<Record<string, never>> { return {}; }
    protected getLoadingMessage(): string { return 'Loading'; }
    public async execute(): Promise<void> { /* not under test */ }

    public html(): Promise<string> { return this.getWebviewContent(); }
    public handlerContext(shared?: SharedState): HandlerContext { return this.createHandlerContext(shared); }
    public setPanel(panel: ReturnType<typeof createMockWebviewPanel> | undefined): void { this.panel = panel; }
}

class MediaPanel extends PlainPanel {
    protected override readonly servesLocalMedia = true;
    protected override documentTitle(): string { return 'Page Title'; }
}

function make<T extends PlainPanel>(Ctor: new (...args: ConstructorParameters<typeof PlainPanel>) => T): T {
    return new Ctor(
        createMockExtensionContext(),
        createMockStateManager() as unknown as StateManager,
        createMockLogger(),
    );
}

beforeEach(() => jest.clearAllMocks());

describe('getWebviewContent', () => {
    it('refuses to build HTML before the panel exists', async () => {
        await expect(make(PlainPanel).html()).rejects.toThrow(
            'Panel must be created before getting webview content',
        );
    });

    it('loads the named bundle, titled by the tab, with no local-media base URI', async () => {
        const command = make(PlainPanel);
        const panel = createMockWebviewPanel();
        command.setPanel(panel);

        const html = await command.html();

        expect(html).toContain('projectsList-bundle.js');
        expect(html).toContain('<title>Plain Tab</title>');
        // One URI only: the bundle. A second would be the dist/ base.
        expect(panel.webview.asWebviewUri).toHaveBeenCalledTimes(1);
        expect(html.match(/<script nonce="/g)).toHaveLength(1);
    });

    it('adds the dist/ base URI and its own page title when the panel asks', async () => {
        const command = make(MediaPanel);
        const panel = createMockWebviewPanel();
        command.setPanel(panel);

        const html = await command.html();

        const uris = (panel.webview.asWebviewUri as jest.Mock).mock.calls.map(
            ([u]) => (u as { fsPath: string }).fsPath,
        );
        expect(uris).toHaveLength(2);
        expect(uris[1]).toMatch(/dist$/);
        expect(html).toContain('<title>Page Title</title>');
        expect(html.match(/<script nonce="/g)).toHaveLength(2);
    });
});

describe('createHandlerContext', () => {
    it('hands the factory this panel and no shared state of its own', () => {
        const command = make(PlainPanel);
        const panel = createMockWebviewPanel();
        command.setPanel(panel);

        expect(command.handlerContext()).toEqual({ marker: 'panel-context' });

        const parts = (createPanelHandlerContext as jest.Mock).mock.calls[0][0];
        expect(parts.panel).toBe(panel);
        expect(parts).not.toHaveProperty('sharedState');
        expect(Object.keys(parts).sort()).toEqual(
            ['communicationManager', 'context', 'panel', 'sendMessage', 'stateManager'],
        );
    });

    it('passes a shared state by reference, so handler changes persist', () => {
        const shared = { isAuthenticating: false } as SharedState;
        make(PlainPanel).handlerContext(shared);

        expect((createPanelHandlerContext as jest.Mock).mock.calls[0][0].sharedState).toBe(shared);
    });

    it('routes the context sendMessage to the panel', async () => {
        const command = make(PlainPanel);
        const send = jest.spyOn(command as unknown as { sendMessage: () => Promise<void> }, 'sendMessage')
            .mockResolvedValue(undefined);
        command.handlerContext();

        await (createPanelHandlerContext as jest.Mock).mock.calls[0][0].sendMessage('ping', { n: 1 });

        expect(send).toHaveBeenCalledWith('ping', { n: 1 });
    });
});
