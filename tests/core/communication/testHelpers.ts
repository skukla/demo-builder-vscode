/**
 * Shared Test Helpers for WebviewCommunicationManager Tests
 *
 * Provides mock setup, factories, and utilities for webview communication testing.
 */

import * as vscode from 'vscode';
import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { Message } from '@/types/messages';

/**
 * Mock Webview and Panel Setup
 *
 * Creates mocked VS Code webview and panel instances for testing.
 */
export interface MockWebviewSetup {
    mockPanel: vscode.WebviewPanel;
    mockWebview: vscode.Webview;
    messageListener: (message: Message) => void;
    captureMessageListener: () => void;
}

/**
 * Create mock webview and panel for testing
 */
export function createMockWebviewSetup(): MockWebviewSetup {
    let messageListener: (message: Message) => void = () => {};

    // Create mock webview
    const mockWebview = {
        postMessage: jest.fn().mockResolvedValue(true),
        onDidReceiveMessage: jest.fn(),
        html: '',
        options: {},
        cspSource: 'mock-csp',
        asWebviewUri: jest.fn()
    } as unknown as vscode.Webview;

    // Create mock panel
    const mockPanel = {
        webview: mockWebview,
        dispose: jest.fn(),
        onDidDispose: jest.fn()
    } as unknown as vscode.WebviewPanel;

    // Function to capture message listener
    const captureMessageListener = () => {
        (mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((listener) => {
            messageListener = listener;
            return { dispose: jest.fn() };
        });
    };

    return {
        mockPanel,
        mockWebview,
        messageListener,
        captureMessageListener
    };
}

/**
 * Complete handshake for manager
 *
 * Sends webview_ready message to complete initialization handshake.
 */
export async function completeHandshake(
    manager: WebviewCommunicationManager,
    messageListener: (message: Message) => void
): Promise<void> {
    const initPromise = manager.initialize();

    // Allow extension_ready to be sent
    await Promise.resolve();

    // Send webview_ready response
    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    await initPromise;
}

/**
 * Create a test message
 */
export function createTestMessage(overrides?: Partial<Message>): Message {
    return {
        id: 'test-1',
        type: 'test-type',
        timestamp: Date.now(),
        ...overrides
    };
}
