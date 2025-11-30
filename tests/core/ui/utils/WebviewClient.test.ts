/**
 * WebviewClient - Handshake Reversal Tests
 *
 * Tests webview-initiated handshake protocol following VS Code Issue #125546 best practice.
 *
 * Target Coverage: 100% (critical handshake logic)
 */

describe('WebviewClient - Handshake Reversal', () => {
    let mockVscodeApi: {
        postMessage: jest.Mock;
        getState: jest.Mock;
        setState: jest.Mock;
    };
    let messageHandlers: Array<(event: MessageEvent) => void>;
    let webviewClient: any;

    beforeEach(() => {
        // Clear module cache to get fresh instance
        jest.resetModules();

        // Reset message handlers
        messageHandlers = [];

        // Mock VS Code API
        mockVscodeApi = {
            postMessage: jest.fn(),
            getState: jest.fn(),
            setState: jest.fn()
        };

        // Mock window.acquireVsCodeApi and addEventListener
        (global as any).window = {
            acquireVsCodeApi: jest.fn(() => mockVscodeApi),
            addEventListener: jest.fn((event: string, handler: (event: MessageEvent) => void) => {
                if (event === 'message') {
                    messageHandlers.push(handler);
                }
            })
        };

        // Load WebviewClient module (singleton created on import)
        const module = require('@/core/ui/utils/WebviewClient');
        webviewClient = module.webviewClient;
    });

    afterEach(() => {
        // Clean up global mocks
        delete (global as any).window;
        jest.clearAllMocks();
    });

    describe('Webview-initiated handshake', () => {
        it('should send __webview_ready__ immediately after initialization', () => {
            // Given: WebviewClient singleton created (happens in beforeEach)
            // When: Module loaded (initialization automatic)

            // Then: __webview_ready__ signal sent during init
            expect(mockVscodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: '__webview_ready__',
                    id: expect.any(String),
                    timestamp: expect.any(Number)
                })
            );
        });

        it('should NOT listen for __extension_ready__ signal', () => {
            // Given: WebviewClient initialized
            // Clear initial __webview_ready__ call
            mockVscodeApi.postMessage.mockClear();

            // When: __extension_ready__ message received
            const extensionReadyMessage = {
                data: {
                    id: 'ext-1',
                    type: '__extension_ready__',
                    timestamp: Date.now()
                }
            } as MessageEvent;

            messageHandlers.forEach(handler => handler(extensionReadyMessage));

            // Then: No response sent (no handler for __extension_ready__)
            const webviewReadyCalls = (mockVscodeApi.postMessage as jest.Mock).mock.calls
                .filter(call => call[0]?.type === '__webview_ready__');

            expect(webviewReadyCalls.length).toBe(0);
        });

        it('should complete handshake when receiving __handshake_complete__', async () => {
            // Given: WebviewClient initialized

            // When: __handshake_complete__ received from extension
            const handshakeCompleteMessage = {
                data: {
                    id: 'hc-1',
                    type: '__handshake_complete__',
                    timestamp: Date.now(),
                    payload: { stateVersion: 1 }
                }
            } as MessageEvent;

            messageHandlers.forEach(handler => handler(handshakeCompleteMessage));

            // Then: Ready promise resolves
            await expect(webviewClient.ready()).resolves.toBeUndefined();
        });

        it('should queue messages until handshake complete', async () => {
            // Given: WebviewClient initialized
            // Clear initial __webview_ready__ message
            mockVscodeApi.postMessage.mockClear();

            // When: Message sent before handshake complete
            webviewClient.postMessage('test-action', { data: 'test' });

            // Then: Message NOT sent immediately (queued)
            expect(mockVscodeApi.postMessage).not.toHaveBeenCalled();

            // When: Handshake completes
            const handshakeCompleteMessage = {
                data: {
                    id: 'hc-1',
                    type: '__handshake_complete__',
                    timestamp: Date.now()
                }
            } as MessageEvent;

            messageHandlers.forEach(handler => handler(handshakeCompleteMessage));

            // Then: Queued message flushed
            expect(mockVscodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'test-action',
                    payload: { data: 'test' }
                })
            );
        });
    });

    describe('Handshake flow diagram', () => {
        it('should follow webview-first handshake sequence', async () => {
            // This test documents the expected handshake sequence

            // Given: WebviewClient already initialized (in beforeEach)
            // Step 1 already happened: Webview sent ready during init

            // Verify __webview_ready__ was sent (check existing calls)
            const readyCall = (mockVscodeApi.postMessage as jest.Mock).mock.calls
                .find(call => call[0]?.type === '__webview_ready__');

            expect(readyCall).toBeDefined();
            expect(readyCall![0]).toMatchObject({
                type: '__webview_ready__',
                id: expect.any(String),
                timestamp: expect.any(Number)
            });

            // Step 2: Extension receives ready, sends handshake complete
            const handshakeCompleteMessage = {
                data: {
                    id: 'hc-1',
                    type: '__handshake_complete__',
                    timestamp: Date.now()
                }
            } as MessageEvent;

            messageHandlers.forEach(handler => handler(handshakeCompleteMessage));

            // Step 3: Ready promise resolves
            await expect(webviewClient.ready()).resolves.toBeUndefined();

            // Verify full sequence: __webview_ready__ → __handshake_complete__ → ready()
            // This documents the correct handshake protocol flow
            expect(readyCall).toBeDefined(); // Webview initiated
            // Ready promise resolved (tested above)
        });
    });
});
