/**
 * WebviewCommunicationManager - Messaging Tests
 *
 * Tests request-response pattern, message handlers, timeouts, and async resolution.
 *
 * Target Coverage: 75%+
 */

import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import * as vscode from 'vscode';
import { Message } from '@/types/messages';

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

describe('WebviewCommunicationManager - Messaging', () => {
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

    describe('request-response pattern', () => {
        it('should send request and await response', async () => {
            const requestPromise = manager.request('test-request', { data: 'test' });

            // Get the request message
            const calls = (mockWebview.postMessage as jest.Mock).mock.calls;
            const requestMessage = calls[0][0] as Message;

            // Simulate webview response
            messageListener({
                id: 'response-1',
                type: '__response__',
                payload: { result: 'success' },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: requestMessage.id
            });

            const response = await requestPromise;

            expect(response).toEqual({ result: 'success' });
        });

        it('should timeout if no response received', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                messageTimeout: 1000
            });

            // Re-complete handshake
            const initPromise = manager.initialize();
            await Promise.resolve();
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });
            await initPromise;

            (mockWebview.postMessage as jest.Mock).mockClear();

            const requestPromise = manager.request('test-request');

            // Fast-forward past timeout
            jest.advanceTimersByTime(1000);

            await expect(requestPromise).rejects.toThrow('Request timeout: test-request');
        });

        it('should reject on error response', async () => {
            const requestPromise = manager.request('test-request');

            const calls = (mockWebview.postMessage as jest.Mock).mock.calls;
            const requestMessage = calls[0][0] as Message;

            // Simulate error response
            messageListener({
                id: 'response-1',
                type: '__response__',
                timestamp: Date.now(),
                isResponse: true,
                responseToId: requestMessage.id,
                error: 'Something went wrong'
            });

            await expect(requestPromise).rejects.toThrow('Something went wrong');
        });

        it('should handle multiple concurrent requests', async () => {
            const request1 = manager.request('request-1', { id: 1 });
            const request2 = manager.request('request-2', { id: 2 });
            const request3 = manager.request('request-3', { id: 3 });

            const calls = (mockWebview.postMessage as jest.Mock).mock.calls;

            // Respond to request 2
            const req2Message = calls.find(c => c[0].type === 'request-2')![0] as Message;
            messageListener({
                id: 'resp-2',
                type: '__response__',
                payload: { result: 2 },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: req2Message.id
            });

            // Respond to request 1
            const req1Message = calls.find(c => c[0].type === 'request-1')![0] as Message;
            messageListener({
                id: 'resp-1',
                type: '__response__',
                payload: { result: 1 },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: req1Message.id
            });

            // Respond to request 3
            const req3Message = calls.find(c => c[0].type === 'request-3')![0] as Message;
            messageListener({
                id: 'resp-3',
                type: '__response__',
                payload: { result: 3 },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: req3Message.id
            });

            const results = await Promise.all([request1, request2, request3]);

            expect(results[0]).toEqual({ result: 1 });
            expect(results[1]).toEqual({ result: 2 });
            expect(results[2]).toEqual({ result: 3 });
        });

        it('should throw error if request sent before handshake', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            await expect(manager.request('test-request')).rejects.toThrow(
                'Cannot send request before handshake complete'
            );
        });
    });

    describe('message handlers', () => {
        it('should register and invoke message handler', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'handled' });
            manager.on('test-message', handler);

            // Simulate incoming message
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: { data: 'test' },
                timestamp: Date.now()
            });

            await Promise.resolve();

            expect(handler).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should send response for messages expecting response', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'handled' });
            manager.on('test-message', handler);

            // Message with expectsResponse flag
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: { data: 'test' },
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            // Should send response
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__response__',
                    payload: { result: 'handled' },
                    isResponse: true,
                    responseToId: 'msg-1'
                })
            );
        });

        // CRITICAL TEST: Async handler resolution (v1.5.0 fix)
        it('should properly await async handler results (v1.5.0 fix)', async () => {
            // Mock async handler that returns Promise
            const asyncHandler = jest.fn().mockResolvedValue({ data: 'result' });
            manager.on('test-message', asyncHandler);

            // Send message with response expectation
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: { input: 'test' },
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            // CRITICAL: Should return resolved value, not Promise object
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__response__',
                    payload: { data: 'result' }, // Resolved value, not Promise
                    isResponse: true
                })
            );

            const responsePayload = (mockWebview.postMessage as jest.Mock).mock.calls[0][0].payload;
            expect(responsePayload).not.toBeInstanceOf(Promise);
            expect(responsePayload).toEqual({ data: 'result' });
        });

        it('should handle synchronous handler results', async () => {
            const handler = jest.fn().mockReturnValue({ result: 'sync' });
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
                    payload: { result: 'sync' }
                })
            );
        });

        it('should send error response if handler throws', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
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
                    isResponse: true,
                    responseToId: 'msg-1',
                    error: 'Handler error'
                })
            );
        });

        it('should support one-time message handlers', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'once' });
            manager.once('test-message', handler);

            // First message
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: {},
                timestamp: Date.now()
            });

            await Promise.resolve();
            expect(handler).toHaveBeenCalledTimes(1);

            // Second message (handler should not be called)
            messageListener({
                id: 'msg-2',
                type: 'test-message',
                payload: {},
                timestamp: Date.now()
            });

            await Promise.resolve();
            expect(handler).toHaveBeenCalledTimes(1); // Still only called once
        });

        it('should send acknowledgment for non-response messages', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'handled' });
            manager.on('test-message', handler);

            messageListener({
                id: 'msg-1',
                type: 'test-message',
                payload: {},
                timestamp: Date.now()
            });

            await Promise.resolve();

            // Should send acknowledgment
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__acknowledge__',
                    responseToId: 'msg-1'
                })
            );
        });

        it('should not send acknowledgment for response messages', async () => {
            // Simulate receiving a response message
            messageListener({
                id: 'resp-1',
                type: '__response__',
                payload: { result: 'test' },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: 'original-msg'
            });

            await Promise.resolve();

            // Should not send acknowledgment for response messages
            expect(mockWebview.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('timeout hints', () => {
        it('should send timeout hint for requests with configured timeouts', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'test' });
            manager.on('get-projects', handler);

            // Message with expectsResponse should trigger timeout hint
            messageListener({
                id: 'msg-1',
                type: 'get-projects',
                payload: { orgId: '123' },
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            // Should send timeout hint
            const timeoutHintCall = (mockWebview.postMessage as jest.Mock).mock.calls.find(
                call => call[0].type === '__timeout_hint__'
            );
            expect(timeoutHintCall).toBeDefined();
        });

        it('should not crash if timeout hint fails to send', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'test' });
            manager.on('authenticate', handler);

            // Make postMessage fail for timeout hint, but succeed for response
            (mockWebview.postMessage as jest.Mock)
                .mockRejectedValueOnce(new Error('Failed'))  // timeout hint fails
                .mockResolvedValueOnce(true);                // response succeeds

            // Should not throw
            messageListener({
                id: 'msg-1',
                type: 'authenticate',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();
            await Promise.resolve();  // Extra flush for response send

            // Handler should still execute
            expect(handler).toHaveBeenCalled();
        });
    });
});
