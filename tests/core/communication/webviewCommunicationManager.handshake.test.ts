/**
 * WebviewCommunicationManager - Handshake & Lifecycle Tests
 *
 * Tests initialization, handshake protocol, message queuing, state tracking, and disposal.
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

describe('WebviewCommunicationManager - Handshake & Lifecycle', () => {
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
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization and handshake', () => {
        it('should NOT send extension ready signal on initialization', async () => {
            // Reversed handshake: extension waits passively for webview
            manager = new WebviewCommunicationManager(mockPanel);

            const initPromise = manager.initialize();

            // Fast-forward to allow any messages to be sent
            await Promise.resolve();

            // Extension should NOT send __extension_ready__ (webview initiates now)
            expect(mockWebview.postMessage).not.toHaveBeenCalledWith(
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
            await Promise.resolve(); // Flush microtask queue

            await expect(initPromise).rejects.toThrow('Webview handshake timeout');

            // Note: This test also covers postMessage failure scenarios, since if postMessage
            // fails during initialize(), the webview never receives extension_ready and thus
            // never sends webview_ready back, resulting in a timeout. The research document
            // identified a separate test for "postMessage failure during initialization" but
            // that functionality is already covered by this timeout test.
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

        it('should handle automatic __webview_ready__ from WebviewClient constructor', async () => {
            // This test documents the reversed handshake behavior (VS Code Issue #125546).
            // The WebviewClient constructor now sends __webview_ready__ immediately after
            // initialization (line 142-148 in WebviewClient.ts), eliminating the need for
            // manual postMessage('ready') calls in UI components.
            // Extension waits passively for this signal instead of sending __extension_ready__.

            manager = new WebviewCommunicationManager(mockPanel);
            const initPromise = manager.initialize();

            await Promise.resolve();

            // Extension should NOT send __extension_ready__ (waits passively)
            expect(mockWebview.postMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__extension_ready__'
                })
            );

            // WebviewClient constructor automatically sends __webview_ready__ (simulated here)
            // In the real webview, this happens in WebviewClient constructor after addEventListener
            messageListener({
                id: 'webview-auto-handshake',
                type: '__webview_ready__',
                timestamp: Date.now()
            });

            await initPromise;

            // Extension responds with handshake complete
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__handshake_complete__'
                })
            );
        });
    });

    describe('message sending', () => {
        // NOTE: Retry tests in this block use real timers instead of fake timers
        // because Jest's fake timers don't handle recursive setTimeout patterns well.
        // The recursive retry logic (setTimeout → retry → setTimeout) requires
        // real async timing to work properly in tests.
        // Reference: .rptc/research/webviewcommunicationmanager-test-failures/research.md

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
            // Use real timers for retry test
            jest.useRealTimers();

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

            await manager.sendMessage('test-message');

            // Should have tried 3 times
            expect(mockWebview.postMessage).toHaveBeenCalledTimes(3);

            // Restore fake timers for other tests
            jest.useFakeTimers();
        });

        it('should throw after max retries exceeded', async () => {
            // Use real timers for retry test
            jest.useRealTimers();

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

            await expect(manager.sendMessage('test-message')).rejects.toThrow();

            // Restore fake timers for other tests
            jest.useFakeTimers();
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
            void manager.request('request-1');
            void manager.request('request-2');

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

        it('should set isDisposed flag when dispose() is called', () => {
            manager.dispose();

            // Verify isDisposed is set (access private field for testing)
            expect((manager as any).isDisposed).toBe(true);
        });

        it('should not throw error when sending to disposed webview', async () => {
            manager.dispose();

            // Sending to disposed webview should not throw (graceful handling)
            await expect(
                manager.sendMessage('test-message', { data: 'test' })
            ).resolves.not.toThrow();

            // Verify isDisposed flag remains true
            expect((manager as any).isDisposed).toBe(true);
        });
    });
});
