/**
 * Shared test utilities for WebviewCommunicationManager tests
 */

import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import * as vscode from 'vscode';
import type { Message } from '@/types/messages';

// Mock VS Code API

// Mock debugLogger

export interface TestMocks {
    mockPanel: vscode.WebviewPanel;
    mockWebview: vscode.Webview;
    manager: WebviewCommunicationManager;
    messageListener: (message: Message) => void;
}

export function setupMocks(): TestMocks {
    jest.clearAllMocks();
    // Note: Timer mode (fake/real) should be managed by each test file
    // to avoid nested timer context issues

    // Create mock webview
    const mockWebview: vscode.Webview = {
        postMessage: jest.fn().mockResolvedValue(true),
        onDidReceiveMessage: jest.fn(),
        html: '',
        options: {},
        cspSource: 'mock-csp',
        asWebviewUri: jest.fn()
    } as unknown as vscode.Webview;

    // Create mock panel
    const mockPanel: vscode.WebviewPanel = {
        webview: mockWebview,
        dispose: jest.fn(),
        onDidDispose: jest.fn()
    } as unknown as vscode.WebviewPanel;

    let messageListener: (message: Message) => void = () => {};

    // Capture message listener
    (mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((listener) => {
        messageListener = listener;
        return { dispose: jest.fn() };
    });

    const manager = new WebviewCommunicationManager(mockPanel);

    return {
        mockPanel,
        mockWebview,
        manager,
        messageListener
    };
}

export function createMockMessage(overrides?: Partial<Message>): Message {
    return {
        id: 'test-1',
        type: 'test-message',
        timestamp: Date.now(),
        ...overrides
    } as Message;
}

export async function completeHandshake(testMocks: TestMocks): Promise<void> {
    const { manager, messageListener } = testMocks;
    const initPromise = manager.initialize();

    await Promise.resolve();

    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    await initPromise;
}

export function cleanupTimers(): void {
    jest.useRealTimers();
}

// ── The SUT and vscode, re-exported ─────────────────────────────────────────
// Specs MUST take these from here rather than importing them directly. jest.mock
// hoists above the imports of the module it appears in, NOT across modules, so a
// spec importing the manager directly would load it before the mocks above were
// registered — which is exactly why all three specs used to re-declare both mocks
// verbatim. Re-exporting removes the ordering question.
export { WebviewCommunicationManager, createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
export * as vscode from 'vscode';

export interface HandshakenMocks extends TestMocks {
    /**
     * The listener the manager registered — read through a function, not held as
     * a value.
     *
     * `setupMocks` returns `messageListener` by value, captured before
     * `initialize()` runs. Two suites therefore could not use it: they need the
     * listener AFTER the handshake, and the value they would have got is the
     * empty default. That is the same by-value trap the PrerequisitesStep helper
     * hit — a dead helper beside N copies of its job usually means the helper is
     * broken, not unwanted.
     */
    listener: () => (message: Message) => void;
}

/**
 * A manager that has completed its handshake and forgotten the messages that took.
 *
 * The sequence is the real one: initialize, let the webview announce itself, wait
 * for the handshake to settle, then clear `postMessage` so a test asserts only
 * what IT caused.
 */
export async function setupHandshakenManager(): Promise<HandshakenMocks> {
    const mocks = setupMocks();
    let live: (message: Message) => void = () => {};
    (mocks.mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((l) => {
        live = l;
        return { dispose: jest.fn() };
    });

    const manager = new WebviewCommunicationManager(mocks.mockPanel);
    const initPromise = manager.initialize();
    await Promise.resolve();

    live({ id: 'webview-1', type: '__webview_ready__', timestamp: Date.now() } as Message);
    await initPromise;

    (mocks.mockWebview.postMessage as jest.Mock).mockClear();

    return { ...mocks, manager, listener: () => live };
}
