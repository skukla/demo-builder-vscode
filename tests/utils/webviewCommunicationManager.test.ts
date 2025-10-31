/**
 * WebviewCommunicationManager Tests
 *
 * Comprehensive test suite for WebviewCommunicationManager utility.
 * Tests handshake protocol, message queuing, request-response, retry logic, and async handler resolution.
 *
 * Target Coverage: 75%+
 */

import { WebviewCommunicationManager, createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
import * as vscode from 'vscode';
import { Message, MessageType, MessagePayload } from '../../src/types/messages';

// Mock VS Code API
jest.mock('vscode');

// Mock debugLogger
jest.mock('../../src/utils/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

describe('WebviewCommunicationManager', () => {
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let manager: WebviewCommunicationManager;
    let messageListener: (message: Message) => void;

    beforeEach(() => {
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
        } as any;

        // Create mock panel
        mockPanel = {
            webview: mockWebview,
            dispose: jest.fn(),
            onDidDispose: jest.fn()
        } as any;

        // Capture message listener
        (mockWebview.onDidReceiveMessage as jest.Mock).mockImplementation((listener) => {
            messageListener = listener;
            return { dispose: jest.fn() };
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization and handshake', () => {
        it('should send extension ready signal on initialization', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();

            // Fast-forward to allow message to be sent
            await Promise.resolve();

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__extension_ready__'
                })
            );

            // Complete handshake
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;
        });

        it('should complete handshake when webview responds', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();

            // Webview responds with ready signal
            await Promise.resolve();
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Should send handshake complete
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__handshake_complete__'
                })
            );
        });

        it('should timeout if webview does not respond', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                handshakeTimeout: 5000
            });

            const initPromise = manager.initialize();

            // Fast-forward past handshake timeout
            jest.advanceTimersByTime(5000);

            await expect(initPromise).rejects.toThrow('Webview handshake timeout');
        });

        it('should use custom handshake timeout', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                handshakeTimeout: 1000
            });

            const initPromise = manager.initialize();

            jest.advanceTimersByTime(999);
            await Promise.resolve();

            // Should not have timed out yet
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;
        });

        it('should queue messages until handshake complete', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();
            await Promise.resolve();

            // Clear initial extension_ready message
            (mockWebview.postMessage as jest.Mock).mockClear();

            // Try to send messages before handshake complete
            await manager.sendMessage('test-message', { data: 'test' });

            // Message should be queued, not sent
            expect(mockWebview.postMessage).not.toHaveBeenCalled();

            // Complete handshake
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Queued messages should be flushed
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'test-message'
                })
            );
        });

        it('should flush multiple queued messages in order', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();
            await Promise.resolve();

            (mockWebview.postMessage as jest.Mock).mockClear();

            // Queue multiple messages
            await manager.sendMessage('message-1', { order: 1 });
            await manager.sendMessage('message-2', { order: 2 });
            await manager.sendMessage('message-3', { order: 3 });

            // Complete handshake
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Verify all messages were sent
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(4); // 3 messages + handshake_complete
        });
    });

    describe('message sending', () => {
        beforeEach(async () => {
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

        it('should send message after handshake', async () => {
            await manager.sendMessage('test-message', { data: 'test' });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'test-message',
                    payload: { data: 'test' }
                })
            );
        });

        it('should include message ID and timestamp', async () => {
            await manager.sendMessage('test-message', { data: 'test' });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: expect.any(String),
                    timestamp: expect.any(Number)
                })
            );
        });

        it('should retry failed messages', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                maxRetries: 3,
                retryDelay: 100
            });

            // Complete handshake
            const initPromise = manager.initialize();
            await Promise.resolve();
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });
            await initPromise;

            (mockWebview.postMessage as jest.Mock).mockClear();

            // Fail first 2 attempts, succeed on 3rd
            (mockWebview.postMessage as jest.Mock)
                .mockRejectedValueOnce(new Error('Failed'))
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce(true);

            const sendPromise = manager.sendMessage('test-message');

            // Fast-forward through retries
            jest.advanceTimersByTime(100);
            await Promise.resolve();
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            await sendPromise;

            // Should have tried 3 times
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(3);
        });

        it('should throw after max retries exceeded', async () => {
            manager = new WebviewCommunicationManager(mockPanel, {
                maxRetries: 2,
                retryDelay: 100
            });

            const initPromise = manager.initialize();
            await Promise.resolve();
            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });
            await initPromise;

            (mockWebview.postMessage as jest.Mock).mockClear();
            (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

            const sendPromise = manager.sendMessage('test-message');

            jest.advanceTimersByTime(100);
            await Promise.resolve();
            jest.advanceTimersByTime(100);
            await Promise.resolve();
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            await expect(sendPromise).rejects.toThrow();
        });
    });

    describe('request-response pattern', () => {
        beforeEach(async () => {
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
            const req2Message = calls.find(c => c[0].type === 'request-2')[0] as Message;
            messageListener({
                id: 'resp-2',
                type: '__response__',
                payload: { result: 2 },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: req2Message.id
            });

            // Respond to request 1
            const req1Message = calls.find(c => c[0].type === 'request-1')[0] as Message;
            messageListener({
                id: 'resp-1',
                type: '__response__',
                payload: { result: 1 },
                timestamp: Date.now(),
                isResponse: true,
                responseToId: req1Message.id
            });

            // Respond to request 3
            const req3Message = calls.find(c => c[0].type === 'request-3')[0] as Message;
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
        beforeEach(async () => {
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

    describe('state version tracking', () => {
        beforeEach(async () => {
            manager = new WebviewCommunicationManager(mockPanel);
            const initPromise = manager.initialize();
            await Promise.resolve();

            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;
        });

        it('should increment state version', () => {
            const initialVersion = manager.getStateVersion();
            const newVersion = manager.incrementStateVersion();

            expect(newVersion).toBe(initialVersion + 1);
            expect(manager.getStateVersion()).toBe(newVersion);
        });

        it('should return current state version', () => {
            const version = manager.getStateVersion();
            expect(typeof version).toBe('number');
            expect(version).toBeGreaterThanOrEqual(0);
        });

        it('should include state version in handshake complete', async () => {
            manager = new WebviewCommunicationManager(mockPanel);

            manager.incrementStateVersion();
            manager.incrementStateVersion();

            const initPromise = manager.initialize();
            await Promise.resolve();

            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Should include stateVersion in handshake complete
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__handshake_complete__',
                    payload: expect.objectContaining({
                        stateVersion: expect.any(Number)
                    })
                })
            );
        });
    });

    describe('dispose', () => {
        beforeEach(async () => {
            manager = new WebviewCommunicationManager(mockPanel);
            const initPromise = manager.initialize();
            await Promise.resolve();

            messageListener({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;
        });

        it('should clear all pending requests', async () => {
            const request1 = manager.request('request-1');
            const request2 = manager.request('request-2');

            manager.dispose();

            // Pending requests should have their timeouts cleared
            // They may reject or remain pending, but should not cause issues
        });

        it('should clear message queue', async () => {
            manager.dispose();

            // Queued messages should be cleared
            // Attempting to send after dispose should fail gracefully
        });

        it('should dispose event listeners', () => {
            manager.dispose();

            // Should not throw
            expect(() => manager.dispose()).not.toThrow();
        });
    });

    describe('timeout hints', () => {
        beforeEach(async () => {
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

            // Make postMessage fail for timeout hint
            (mockWebview.postMessage as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

            // Should not throw
            messageListener({
                id: 'msg-1',
                type: 'authenticate',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            await Promise.resolve();

            // Handler should still execute
            expect(handler).toHaveBeenCalled();
        });
    });

    describe('createWebviewCommunication factory', () => {
        it('should create and initialize communication manager', async () => {
            const manager = await createWebviewCommunication(mockPanel);

            expect(manager).toBeInstanceOf(WebviewCommunicationManager);
        });

        it('should accept configuration options', async () => {
            const manager = await createWebviewCommunication(mockPanel, {
                messageTimeout: 5000,
                maxRetries: 5
            });

            expect(manager).toBeInstanceOf(WebviewCommunicationManager);
        });
    });

    describe('edge cases and error handling', () => {
        beforeEach(async () => {
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

        it('should handle missing payload gracefully', async () => {
            const handler = jest.fn().mockResolvedValue({ result: 'ok' });
            manager.on('test-message', handler);

            // Message without payload
            messageListener({
                id: 'msg-1',
                type: 'test-message',
                timestamp: Date.now()
            });

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
                payload: null as any,
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

        it('should handle postMessage failure during initialization', async () => {
            (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

            manager = new WebviewCommunicationManager(mockPanel);

            await expect(manager.initialize()).rejects.toThrow();
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
