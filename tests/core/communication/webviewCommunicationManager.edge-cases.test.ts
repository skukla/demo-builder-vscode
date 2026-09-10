/**
 * WebviewCommunicationManager - Edge Cases & Error Handling Tests
 *
 * Tests factory function, error handling, logging configuration, and edge cases.
 *
 * Target Coverage: 75%+
 */

import {
    WebviewCommunicationManager,
    createWebviewCommunication,
    vscode,
    setupHandshakenManager,
} from './webviewCommunicationManager.testUtils';
import { Message } from '@/types/messages';
import { getLogger } from '@/core/logging/debugLogger';

describe('WebviewCommunicationManager - Edge Cases & Error Handling', () => {
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let manager: WebviewCommunicationManager;
    let listener: () => (message: Message) => Promise<void>;

    beforeEach(async () => {
        jest.useFakeTimers();
        ({ mockPanel, mockWebview, manager, listener } = await setupHandshakenManager());
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
            listener()({
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
            listener()({
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
            listener()({
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

            listener()({
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
            listener()({
                id: 'msg-1',
                type: 'unknown-message',
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

            listener()({
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

            listener()({
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
            listener()({
                id: 'msg-1',
                type: 'message-1',
                payload: {},
                timestamp: Date.now(),
                expectsResponse: true
            });

            listener()({
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
            // "Should not crash" WAS the claim, and it is a real one — it just was
            // not asserted. Delivering the orphan is the assertion now, and the
            // manager still has to work afterwards; a listener left in a broken
            // state would pass a bare not-to-throw.
            await expect(
                listener()({
                    id: 'resp-1',
                    type: '__response__',
                    payload: { result: 'orphan' },
                    timestamp: Date.now(),
                    isResponse: true,
                    responseToId: 'nonexistent-request'
                })
            ).resolves.toBeUndefined();

            const handler = jest.fn().mockResolvedValue(undefined);
            manager.on('after-orphan', handler);
            await listener()({
                id: 'msg-after',
                type: 'after-orphan',
                payload: {},
                timestamp: Date.now()
            });

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('logging configuration', () => {
        it('should respect enableLogging option', async () => {
            // The old version said "we can't easily test this without exposing the
            // logger" and asserted nothing. The logger is a module singleton, so it
            // can simply be spied on — and the path that logs is QUEUEING, which
            // happens only before the handshake completes.
            const debug = jest.spyOn(getLogger(), 'debug');
            debug.mockClear();

            manager = new WebviewCommunicationManager(mockPanel, {
                enableLogging: false
            });

            const initPromise = manager.initialize();
            await Promise.resolve();

            void manager.sendMessage('queued-while-opening', {});

            listener()({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            expect(debug).not.toHaveBeenCalledWith(
                expect.stringContaining('[WebviewComm]')
            );
        });

        it('should enable logging by default', async () => {
            // The positive half. Same path, no config — if this did not log, the
            // negative test above would pass for the wrong reason.
            const debug = jest.spyOn(getLogger(), 'debug');
            debug.mockClear();

            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();
            await Promise.resolve();

            void manager.sendMessage('queued-while-opening', {});

            listener()({
                id: 'webview-1',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            expect(debug).toHaveBeenCalledWith(
                expect.stringContaining('[WebviewComm]')
            );
        });
    });
});
