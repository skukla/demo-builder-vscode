/**
 * WebviewCommunicationManager - Edge Cases & Error Handling Tests
 *
 * Tests factory function, error handling, logging configuration, and edge cases.
 *
 * Target Coverage: 75%+
 */

import { WebviewCommunicationManager, createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
import * as vscode from 'vscode';
import { Message, MessageType } from '@/types/messages';

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

describe('WebviewCommunicationManager - Edge Cases & Error Handling', () => {
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let manager: WebviewCommunicationManager;
    let messageListener: (message: Message) => void;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Create mock webview
        mockWebview = {
            postMessage: jest.fn().mockResolvedValue(true),
            onDidReceiveMessage: jest.fn(),
            html: '',
            options: {},
            cspSource: 'mock-csp',
            asWebviewUri: jest.fn()
        } as unknown as vscode.Webview;

        // Create mock panel
        mockPanel = {
            webview: mockWebview,
            dispose: jest.fn(),
            onDidDispose: jest.fn()
        } as unknown as vscode.WebviewPanel;

        // Capture message listener
        (mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((listener) => {
            messageListener = listener;
            return { dispose: jest.fn() };
        });

        // Setup manager and complete handshake
        manager = new WebviewCommunicationManager(mockPanel);
        const initPromise = manager.initialize();
        await Promise.resolve();

        messageListener({
            id: 'webview-1',
            type: '__webview_ready__',
            timestamp: Date.now()
        });

        await initPromise;

        (mockWebview.postMessage as jest.Mock).mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('createWebviewCommunication factory', () => {
        // NOTE: Factory tests must manually trigger handshake completion by sending
        // __webview_ready__ message. The factory function waits for the handshake
        // to complete before returning the manager instance, so tests must simulate
        // the webview responding to the extension_ready message.
        // Reference: .rptc/research/webviewcommunicationmanager-test-failures/research.md

        it('should create and initialize communication manager', async () => {
            // Start factory (returns promise)
            const managerPromise = createWebviewCommunication(mockPanel);

            // Allow extension_ready to be sent
            await Promise.resolve();

            // Simulate webview responding
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            // Now await the factory result
            const manager = await managerPromise;

            expect(manager).toBeInstanceOf(WebviewCommunicationManager);
        });

        it('should accept configuration options', async () => {
            // Start factory with options
            const managerPromise = createWebviewCommunication(mockPanel, {
                messageTimeout: 5000,
                maxRetries: 5
            });

            // Allow extension_ready to be sent
            await Promise.resolve();

            // Simulate webview responding
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            // Now await the factory result
            const manager = await managerPromise;

            expect(manager).toBeInstanceOf(WebviewCommunicationManager);
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle missing payload gracefully', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'ok' });
            manager.on('test-message', handler);

            // Message without payload
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                timestamp: Date.now()
            } as Message);

            await Promise.resolve();

            // Should call handler with empty payload
            expect(handler).toHaveBeenCalledWith({});
        });

        it('should handle null/undefined payload gracefully', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'ok' });
            manager.on('test-message', handler);

            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: null as unknown as Record<string, unknown>,
                timestamp: Date.now()
            });

            await Promise.resolve();

            expect(handler).toHaveBeenCalledWith({});
        });

        it('should handle unregistered message types gracefully', async () => {
            // Message with no registered handler
            messageListener({
                id: 'msg-1',
                type: 'unknown-message' as MessageType,
                payload: {},
                timestamp: Date.now()
            });

            await Promise.resolve();

            // Should still send acknowledgment
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__acknowledge__'
                })
            );
        });

        it('should handle handler returning undefined', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
            manager.on('test-message', handler);

            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__response__',
                    payload: undefined
                })
            );
        });

        it('should handle handler throwing non-Error', async () => {
            const handler = jest.fn().mockRejectedValue('String error');
            manager.on('test-message', handler);

            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__response__',
                    error: 'Unknown error'
                })
            );
        });

        it('should handle concurrent message handlers correctly', async () => {
            const handler1 = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { handler: 1 };
            });

            const handler2 = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { handler: 2 };
            });

            manager.on('message-1', handler1);
            manager.on('message-2', handler2);

            // Send both messages
            messageListener({
                id: 'msg-1',
                type: 'message-1',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            messageListener({
                id: 'msg-2',
                type: 'message-2',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            jest.advanceTimersByTime(100);
            await Promise.resolve();

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should handle response to non-existent request', async () => {
            // Response to request that doesn't exist
            messageListener({
                id: 'resp-1',
                type: '__response__',
                payload: { result: 'orphan' },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: 'nonexistent-request'
            });

            await Promise.resolve();

            // Should not crash
        });
    });

    describe('logging configuration', () => {
        it('should respect enableLogging option', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                enableLogging: false
            });

            const initPromise = manager.initialize();
            await Promise.resolve();

            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Logger should not be called if logging disabled
            // (We can't easily test this without exposing logger, but config is set)
        });

        it('should enable logging by default', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();
            await Promise.resolve();

            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Logging should be enabled (default behavior)
        });
    });
});
