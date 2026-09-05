/**
 * The module wall and the concrete subclass every BaseWebviewCommand suite needs.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS. `jest.mock` hoists to the top of the
 * module it appears in, so the calls below run when a suite imports this helper
 * — but only before the suite's own imports if this import comes FIRST. Put it
 * above `import * as vscode from 'vscode'` or the command binds the real module.
 *
 * `WebviewPanelManager` is deliberately NOT mocked: it holds the singleton maps
 * the command delegates to, and a fake would let a delegation that goes to the
 * wrong place still pass.
 */

jest.mock('vscode', () => {
    const panels: MintedPanel[] = [];
    return {
        window: {
            createWebviewPanel: jest.fn(() => {
                const panel: MintedPanel = {
                    webview: {
                        html: '',
                        postMessage: jest.fn().mockResolvedValue(true),
                        onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                        asWebviewUri: jest.fn((uri: unknown) => uri),
                    },
                    onDidDispose: jest.fn((cb: () => void) => {
                        panel.fireDisposal = cb;
                        return { dispose: jest.fn() };
                    }),
                    dispose: jest.fn(() => panel.fireDisposal?.()),
                    reveal: jest.fn(),
                    visible: true,
                };
                panels.push(panel);
                return panel;
            }),
            onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })),
            setStatusBarMessage: jest.fn(),
            withProgress: jest.fn(
                (_options: unknown, task: (p: { report: jest.Mock }) => unknown) =>
                    task({ report: jest.fn() }),
            ),
        },
        ViewColumn: { One: 1 },
        Uri: { file: (p: string) => ({ fsPath: p }) },
        ColorThemeKind: { Dark: 1, Light: 2 },
        __mintedPanels: panels,
    };
});

jest.mock('@/core/communication/webviewCommunicationManager', () => ({
    createWebviewCommunication: jest.fn(),
}));

jest.mock('@/core/utils/loadingHTML', () => ({
    setLoadingState: jest.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { createMockLogger } from '../../helpers/loggerFake';

/** The panel shape the mocked `createWebviewPanel` mints. */
export interface MintedPanel {
    webview: {
        html: string;
        postMessage: jest.Mock;
        onDidReceiveMessage: jest.Mock;
        asWebviewUri: jest.Mock;
    };
    onDidDispose: jest.Mock;
    dispose: jest.Mock;
    reveal: jest.Mock;
    visible: boolean;
    /** Set by `onDidDispose`; call it to fire disposal as VS Code would. */
    fireDisposal?: () => void;
}

/** Every panel minted so far, oldest first. */
export function mintedPanels(): MintedPanel[] {
    return (vscode as unknown as { __mintedPanels: MintedPanel[] }).__mintedPanels;
}

/** Forget every minted panel. Call from `beforeEach`. */
export function resetMintedPanels(): void {
    mintedPanels().length = 0;
}

/** The handler map a comm-manager fake records, keyed by message type. */
export type HandlerMap = Record<string, (payload: never) => unknown>;

export interface CommFake {
    on: jest.Mock;
    sendMessage: jest.Mock;
    request: jest.Mock;
    dispose: jest.Mock;
    incrementStateVersion: jest.Mock;
    getStateVersion: jest.Mock;
    /** Every handler the command registered, so a test can invoke one directly. */
    handlers: HandlerMap;
}

/**
 * A communication manager that REMEMBERS its handlers.
 *
 * The standard handlers are registered as callbacks and never called by the
 * command itself, so a fake that only records `on` was called says nothing
 * about what the handler does. This one hands the callback back.
 */
export function createCommFake(): CommFake {
    const handlers: HandlerMap = {};
    return {
        on: jest.fn((type: string, handler: (payload: never) => unknown) => {
            handlers[type] = handler;
        }),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        request: jest.fn().mockResolvedValue({}),
        dispose: jest.fn(),
        incrementStateVersion: jest.fn(),
        getStateVersion: jest.fn().mockReturnValue(7),
        handlers,
    };
}

/** Point `createWebviewCommunication` at this fake for the next call. */
export function useCommFake(fake: CommFake): void {
    (createWebviewCommunication as jest.Mock).mockResolvedValue(fake);
}

/** A state manager with just the two members the standard handlers touch. */
export function createStateManagerFake(project: unknown = { name: 'test-project' }) {
    return {
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    };
}

/**
 * A concrete command, since BaseWebviewCommand is abstract.
 *
 * Everything a subclass must supply is here as an overridable member so one
 * class covers "the default" and "a subclass that opted in".
 */
export class TestWebviewCommand extends BaseWebviewCommand {
    public loadingHeaderOverride: { title: string; subtitle?: string } | undefined | 'default' =
        'default';
    public registeredHandlerTypes: string[] = [];

    public async execute(): Promise<void> {
        await this.openPanel();
        await this.startCommunication();
    }

    protected getWebviewId(): string {
        return 'test-webview';
    }

    protected getWebviewTitle(): string {
        return 'Test Webview';
    }

    protected async getWebviewContent(): Promise<string> {
        return '<html><body>Test</body></html>';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('subclass-handler', () => undefined);
        this.registeredHandlerTypes.push('subclass-handler');
    }

    protected async getInitialData(): Promise<unknown> {
        return { test: true };
    }

    protected getLoadingMessage(): string {
        return 'Loading...';
    }

    protected override getLoadingHeader() {
        return this.loadingHeaderOverride === 'default'
            ? super.getLoadingHeader()
            : this.loadingHeaderOverride;
    }

    // The protected surface, opened up for the specs.
    public openPanel(): Promise<vscode.WebviewPanel> {
        return this.createOrRevealPanel();
    }

    public startCommunication(): Promise<WebviewCommunicationManager> {
        return this.initializeCommunication();
    }

    public currentPanel(): vscode.WebviewPanel | undefined {
        return this.panel;
    }

    public currentComm(): WebviewCommunicationManager | undefined {
        return this.communicationManager;
    }

    public forgetComm(): void {
        this.communicationManager = undefined;
    }

    public send(type: string, payload?: unknown): Promise<void> {
        return this.sendMessage(type, payload);
    }

    public ask<T>(type: string, payload?: unknown): Promise<T> {
        return this.request<T>(type, payload);
    }

    public getDisposablesForTest() {
        return this.disposables;
    }

    public nonce(): string {
        return this.getNonce();
    }

    public loadingHeader() {
        return this.getLoadingHeader();
    }
}

/**
 * A subclass that opts INTO reopening Welcome.
 *
 * `TestWebviewCommand` deliberately does not override
 * `shouldReopenWelcomeOnDispose`, so the base class's own default is the thing
 * under test everywhere else; this is the other side of that decision.
 */
export class ReopeningWebviewCommand extends TestWebviewCommand {
    protected override shouldReopenWelcomeOnDispose(): boolean {
        return true;
    }
}

/** A command wired to fakes, plus the fakes themselves. */
export function makeCommand(
    project: unknown = { name: 'test-project' },
    Command: new (
        context: vscode.ExtensionContext,
        stateManager: never,
        logger: never,
    ) => TestWebviewCommand = TestWebviewCommand,
) {
    const stateManager = createStateManagerFake(project);
    const logger = createMockLogger();
    const command = new Command(
        createMockExtensionContext({ extensionPath: '/test' }),
        stateManager as never,
        logger as never,
    );
    return { command, stateManager, logger };
}
