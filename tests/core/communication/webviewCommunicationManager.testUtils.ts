/**
 * Shared test utilities for WebviewCommunicationManager tests
 */

import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import * as vscode from 'vscode';
import type { Message } from '@/types/messages';

// Mock VS Code API
jest.mock('vscode');

// Mock debugLogger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

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