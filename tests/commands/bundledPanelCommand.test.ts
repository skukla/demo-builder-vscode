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
import type { StateManager as StateView } from '@/types/state';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
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
    public open(projectPath?: unknown): ReturnType<PlainPanel['openForCurrentProject']> { return this.openForCurrentProject(projectPath); }
    public follow(newPath: string): void { this.followOwnProject(newPath); }
    public state(): StateView { return this.stateManager; }
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

// AI-15: a screen shown for one project keeps acting on it after the current project moves.
describe('openForCurrentProject', () => {
    const A = createMockProject({ name: 'justrite', path: '/projects/justrite' });
    const B = createMockProject({ name: 'scratch', path: '/projects/scratch' });

    function screenOver(real: ReturnType<typeof createMockStateManager>): PlainPanel {
        return new PlainPanel(createMockExtensionContext(), real as unknown as StateManager, createMockLogger());
    }

    it('keeps answering for the project it opened for after another becomes current', async () => {
        const real = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValueOnce(A).mockResolvedValue(B),
            loadProjectFromPath: jest.fn().mockResolvedValue(A),
        });
        const screen = screenOver(real);

        expect(await screen.open()).toBe(A);
        await screen.state().getCurrentProject();

        expect(real.loadProjectFromPath).toHaveBeenCalledWith(A.path, undefined, { persistAfterLoad: false });
    });

    it('opens for a project another screen named, without reading the current one', async () => {
        const real = createMockStateManager({ loadProjectFromPath: jest.fn().mockResolvedValue(A) });
        const screen = screenOver(real);

        expect(await screen.open(A.path)).toBe(A);
        expect(real.getCurrentProject).not.toHaveBeenCalled();
    });

    it('follows its project to a new folder after a rename', async () => {
        const real = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(A),
            loadProjectFromPath: jest.fn().mockResolvedValue(A),
        });
        const screen = screenOver(real);
        await screen.open();

        screen.follow('/projects/justrite-2');
        await screen.state().getCurrentProject();

        expect(real.loadProjectFromPath).toHaveBeenLastCalledWith('/projects/justrite-2', undefined, { persistAfterLoad: false });
    });

    // The projects list selects a project by saving it; it never opens FOR one.
    it('leaves a screen that never opens for a project on the real manager', () => {
        const real = createMockStateManager();

        expect(screenOver(real).state()).toBe(real);
    });
});
