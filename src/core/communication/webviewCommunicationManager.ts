import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    Message,
    MessageType,
    MessagePayload,
    PendingRequest,
} from '@/types/messages';

/**
 * Message Handler Function Type
 *
 * Handlers can return Promise or direct value.
 * Payload type is flexible to support all message types.
 */
type MessageHandlerFunction<P = MessagePayload, R = unknown> = (
    payload: P
) => Promise<R> | R;

/**
 * Communication manager configuration
 */
interface CommunicationConfig {
    handshakeTimeout?: number;
    messageTimeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    enableLogging?: boolean;
}

/**
 * Request timeout mappings from backend to frontend
 * Maps request types to their required timeout durations
 */
const REQUEST_TIMEOUTS: Record<string, number> = {
    // Authentication
    'authenticate': TIMEOUTS.BROWSER_AUTH,           // 60s - browser-based auth flow
    
    // Data loading (wizard UI)
    'get-projects': TIMEOUTS.PROJECT_LIST,           // 30s - fetch project list from Adobe
    'get-workspaces': TIMEOUTS.WORKSPACE_LIST,       // 30s - fetch workspace list from Adobe
    
    // Project/workspace selection (write operations)
    'select-project': TIMEOUTS.CONFIG_WRITE,         // 10s - write selected project to config
    'select-workspace': TIMEOUTS.CONFIG_WRITE,       // 10s - write selected workspace to config
    
    // API Mesh operations
    'check-api-mesh': 60000,                         // 60s - workspace download + mesh describe
    'create-api-mesh': TIMEOUTS.API_MESH_CREATE,     // 120s - create and deploy mesh
    'update-api-mesh': TIMEOUTS.API_MESH_UPDATE,      // 120s - update and deploy mesh
};

/**
 * Manages robust bidirectional communication between extension and webview
 *
 * Features:
 * - Message queuing until both sides are ready
 * - Webview-initiated handshake protocol (VS Code Issue #125546)
 * - Request-response pattern with timeouts
 * - Automatic retry for failed messages
 * - State version tracking
 * - Comprehensive logging
 * - Backend-specified timeouts (single source of truth)
 *
 * Handshake Protocol (Reversed - Webview Initiates):
 * 1. Extension sets up message listener and waits passively
 * 2. Webview loads JavaScript bundle and sends `__webview_ready__`
 * 3. Extension receives ready signal and sends `__handshake_complete__`
 * 4. Both sides flush queued messages and begin normal communication
 *
 * This approach eliminates race conditions where the extension sends messages
 * before the webview JavaScript bundle has finished loading.
 */
export class WebviewCommunicationManager {
    private panel: vscode.WebviewPanel;
    private messageQueue: Message[] = [];
    private pendingRequests = new Map<string, PendingRequest>();
    private messageHandlers = new Map<string, MessageHandlerFunction>();
    private isWebviewReady = false;
    private isExtensionReady = false;
    private handshakeComplete = false;
    private stateVersion = 0;
    private disposables: vscode.Disposable[] = [];
    private logger = getLogger();
    private config: Required<CommunicationConfig>;

    constructor(panel: vscode.WebviewPanel, config: CommunicationConfig = {}) {
        this.panel = panel;
        this.config = {
            handshakeTimeout: config.handshakeTimeout || 10000,
            messageTimeout: config.messageTimeout || 30000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            enableLogging: config.enableLogging !== false,
        };
    }

    /**
     * Initialize communication with handshake protocol
     */
    async initialize(): Promise<void> {
        if (this.config.enableLogging) {
            this.logger.debug('[WebviewComm] Starting initialization');
        }

        // Set up message listener
        this.panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            undefined,
            this.disposables,
        );

        // Mark extension as ready
        this.isExtensionReady = true;

        // Wait for handshake to complete
        return new Promise((resolve, reject) => {
            const handshakeTimeout = setTimeout(() => {
                reject(new Error('Webview handshake timeout'));
            }, this.config.handshakeTimeout);

            // Set up handshake completion handler
            // Extension waits passively for webview ready signal (VS Code Issue #125546)
            this.once('__webview_ready__', () => {
                this.isWebviewReady = true;
                
                // Send handshake confirmation
                this.sendRawMessage({
                    id: uuidv4(),
                    type: '__handshake_complete__',
                    timestamp: Date.now(),
                    payload: { stateVersion: this.stateVersion },
                });

                this.handshakeComplete = true;
                clearTimeout(handshakeTimeout);

                if (this.config.enableLogging) {
                    this.logger.debug('[WebviewComm] Handshake complete');
                }

                // Flush queued messages
                this.flushMessageQueue();

                resolve();
            });
        });
    }

    /**
     * Send a message to the webview (fire-and-forget)
     */
    async sendMessage(type: MessageType, payload?: MessagePayload): Promise<void> {
        const message: Message = {
            id: uuidv4(),
            type,
            payload,
            timestamp: Date.now(),
        };

        if (!this.handshakeComplete) {
            if (this.config.enableLogging) {
                this.logger.debug(`[WebviewComm] Queuing message: ${type}`);
            }
            this.messageQueue.push(message);
            return;
        }

        await this.sendWithRetry(message);
    }

    /**
     * Send a request and wait for response
     */
    async request<T = unknown>(type: MessageType, payload?: MessagePayload): Promise<T> {
        const message: Message = {
            id: uuidv4(),
            type,
            payload,
            timestamp: Date.now(),
        };

        if (!this.handshakeComplete) {
            throw new Error('Cannot send request before handshake complete');
        }

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(message.id);
                reject(new Error(`Request timeout: ${type}`));
            }, this.config.messageTimeout);

            // Track pending request
            this.pendingRequests.set(message.id, {
                resolve: resolve as (value: unknown | PromiseLike<unknown>) => void,
                reject,
                timeout,
                retryCount: 0,
                message,
            });

            // Send the request
            this.sendRawMessage(message);
        });
    }

    /**
     * Register a message handler
     */
    on<P = MessagePayload, R = unknown>(
        type: MessageType,
        handler: MessageHandlerFunction<P, R>,
    ): void {
        this.messageHandlers.set(type, handler as MessageHandlerFunction);
    }

    /**
     * Register a one-time message handler
     */
    once<P = MessagePayload, R = unknown>(
        type: MessageType,
        handler: MessageHandlerFunction<P, R>,
    ): void {
        const wrappedHandler: MessageHandlerFunction = (payload: MessagePayload) => {
            this.messageHandlers.delete(type);
            return handler(payload as P);
        };
        this.messageHandlers.set(type, wrappedHandler);
    }

    /**
     * Register a streaming message handler (alias for on)
     *
     * Explicit naming to indicate handlers that return streaming responses.
     * Functionally identical to on() but semantically clearer for response handlers.
     */
    onStreaming<P = MessagePayload, R = unknown>(
        type: MessageType,
        handler: MessageHandlerFunction<P, R>,
    ): void {
        this.on(type, handler);
    }

    /**
     * Update state version (for consistency tracking)
     */
    incrementStateVersion(): number {
        return ++this.stateVersion;
    }

    /**
     * Get current state version
     */
    getStateVersion(): number {
        return this.stateVersion;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        // Clear all timeouts
        this.pendingRequests.forEach(request => {
            clearTimeout(request.timeout);
        });
        this.pendingRequests.clear();

        // Dispose of event listeners
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Clear queues
        this.messageQueue = [];
        this.messageHandlers.clear();
    }

    /**
     * Handle incoming message from webview
     */
    private async handleWebviewMessage(message: Message): Promise<void> {
        if (this.config.enableLogging) {
            this.logger.debug(`[WebviewComm] Received: ${message.type}`);
        }

        // Handle special protocol messages
        if (message.type === '__webview_ready__') {
            const handler = this.messageHandlers.get('__webview_ready__');
            if (handler) {
                await handler(message.payload ?? {} as MessagePayload);
            }
            return;
        }

        if (message.type === '__acknowledge__') {
            // Message acknowledged, no action needed
            return;
        }

        // Handle response messages
        if (message.isResponse && message.responseToId) {
            const pending = this.pendingRequests.get(message.responseToId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(message.responseToId);

                if (message.error) {
                    pending.reject(new Error(message.error));
                } else {
                    pending.resolve(message.payload);
                }
            }
            return;
        }

        // Handle regular messages
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try {
                // Send timeout hint for requests that need extended timeouts
                // NOTE: Nesting depth intentional - timeout hint must not block handler execution
                if (message.id && message.expectsResponse) {
                    const requestTimeout = REQUEST_TIMEOUTS[message.type];
                    if (requestTimeout) {
                        // Fire-and-forget: Don't await to avoid blocking handler
                        this.sendRawMessage({
                            id: uuidv4(),
                            type: '__timeout_hint__',
                            payload: {
                                requestId: message.id,
                                timeout: requestTimeout,
                            },
                            timestamp: Date.now(),
                        }).catch(hintError => {
                            // Timeout hint is non-critical, log and continue
                            if (this.config.enableLogging) {
                                this.logger.warn(`[WebviewComm] Failed to send timeout hint (non-fatal): ${hintError}`);
                            }
                        });
                    }
                }

                // CRITICAL FIX (v1.5.0): Properly await async handler results
                // Previously, Promise objects were being sent to UI instead of resolved values
                // This caused "Error Loading Projects" despite successful backend operations
                const result = await handler(message.payload ?? {} as MessagePayload);

                // If the message has an ID, send a response
                if (message.id && message.expectsResponse) {
                    this.sendRawMessage({
                        id: uuidv4(),
                        type: '__response__',
                        payload: result as MessagePayload,
                        timestamp: Date.now(),
                        isResponse: true,
                        responseToId: message.id,
                    });
                }
            } catch (error) {
                if (message.id && message.expectsResponse) {
                    this.sendRawMessage({
                        id: uuidv4(),
                        type: '__response__',
                        payload: undefined,
                        timestamp: Date.now(),
                        isResponse: true,
                        responseToId: message.id,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
        }

        // Send acknowledgment for non-response messages
        if (!message.isResponse) {
            this.sendRawMessage({
                id: uuidv4(),
                type: '__acknowledge__',
                timestamp: Date.now(),
                responseToId: message.id,
            });
        }
    }

    /**
     * Send message with retry logic
     */
    private async sendWithRetry(message: Message, retryCount = 0): Promise<void> {
        try {
            await this.sendRawMessage(message);
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                if (this.config.enableLogging) {
                    this.logger.debug(`[WebviewComm] Retrying message ${message.type} (attempt ${retryCount + 1})`);
                }
                
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                await this.sendWithRetry(message, retryCount + 1);
            } else {
                throw error;
            }
        }
    }

    /**
     * Send raw message to webview
     */
    private async sendRawMessage(message: Message): Promise<void> {
        try {
            await this.panel.webview.postMessage(message);
        } catch (error) {
            if (this.config.enableLogging) {
                this.logger.error(`[WebviewComm] Failed to send message: ${error}`);
            }
            throw error;
        }
    }

    /**
     * Flush queued messages after handshake
     */
    private flushMessageQueue(): void {
        if (this.config.enableLogging) {
            this.logger.debug(`[WebviewComm] Flushing ${this.messageQueue.length} queued messages`);
        }

        const messages = [...this.messageQueue];
        this.messageQueue = [];

        messages.forEach(message => {
            this.sendWithRetry(message);
        });
    }
}

/**
 * Factory function for creating communication manager
 */
export async function createWebviewCommunication(
    panel: vscode.WebviewPanel,
    config?: CommunicationConfig,
): Promise<WebviewCommunicationManager> {
    const manager = new WebviewCommunicationManager(panel, config);
    await manager.initialize();
    return manager;
}