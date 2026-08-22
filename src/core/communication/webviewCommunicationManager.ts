import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Message, PendingRequest } from '@/types/messages';

/**
 * Message Handler Function Type
 *
 * Handlers can return Promise or direct value.
 * Payload type is flexible to support all message types.
 */
type MessageHandlerFunction<P = unknown, R = unknown> = (payload: P) => Promise<R> | R;

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
    authenticate: TIMEOUTS.AUTH.BROWSER, // 60s - browser-based auth flow
    // Awaits the SAME browser sign-in as 'authenticate', then restores project context
    // and refreshes status — so it needs at least the same budget. Callers await it to
    // know when sign-in finished (the API picker re-fetches on success).
    reAuthenticate: TIMEOUTS.AUTH.BROWSER, // 60s - browser sign-in + context restore

    // Data loading (wizard UI)
    // 30s was NOT enough and timed out on work that would have finished: each of
    // these bounds the SDK attempt at SDK_ENTITY_FETCH (10s) and then falls back to
    // the `aio` CLI, so a slow Adobe endpoint spends the SDK budget BEFORE the
    // fallback even starts. Budget for the sum, not the fast path.
    'get-projects': TIMEOUTS.LONG, // 180s - SDK attempt + CLI fallback
    'get-workspaces': TIMEOUTS.LONG, // 180s - SDK attempt + CLI fallback
    'list-org-console-apis': TIMEOUTS.LONG, // 180s - full org services catalog (getServicesForOrg); same slow call the mesh subscribe path budgets for

    // Console APIs on a LIVE project (dashboard twins of the wizard messages
    // above). They hit the SAME getServicesForOrg / subscribe calls, so they need
    // the same budgets — without them the frontend's 30s default applied, and a
    // 35.2s catalog fetch reported "Request timeout: listConsoleApis" in the UI
    // while the extension logged a successful 96-service result (2026-07-31).
    listConsoleApis: TIMEOUTS.LONG, // 180s - same catalog fetch as list-org-console-apis

    addConsoleApis: TIMEOUTS.LONG, // 180s - catalog fetch + union subscribe PUT
    setConsoleApis: TIMEOUTS.LONG, // 180s - catalog fetch + reconcile subscribe PUT

    // Project/workspace selection (validate reachability + ack; no global aio mutation)
    'select-project': TIMEOUTS.NORMAL, // 30s - validate project reachable, then ack
    'select-workspace': TIMEOUTS.NORMAL, // 30s - validate workspace, then ack

    // API Mesh operations
    'check-api-mesh': TIMEOUTS.AUTH.BROWSER, // 60s - workspace download + mesh describe
    'update-api-mesh': TIMEOUTS.LONG, // 180s - update and deploy mesh
    'ensure-mesh-api-subscribed': TIMEOUTS.LONG, // 180s - subscribe required APIs (getCredentials + create + subscribe; multiple Adobe calls)

    // AEM Code Sync check. The fast path answers in about a second, but only
    // because the caller passed `skipTrigger`. "Check Again" does NOT, and when
    // Helix has never heard of the repo the handler TRIGGERS a real code sync and
    // polls it (`checkGitHubAppHandler.triggerAndWaitForCodeSync`, bounded by
    // TIMEOUTS.LONG over 30 attempts). Unbudgeted, the frontend hung up at 30s and
    // showed "couldn't verify" while the sync ran on for up to another 2.5 minutes
    // and often succeeded — the 2026-07-31 failure above, in a different message.
    'check-github-app': TIMEOUTS.LONG, // 180s - may trigger a code sync and poll it

    // Project deletion (EDS cleanup involves multiple external APIs)
    deleteProject: TIMEOUTS.LONG, // 180s - DA.live + GitHub + local cleanup

    // Adobe Console project teardown (modal think-time + registrations +
    // providers + project delete; see PROJECT_TEARDOWN's budget math)
    'delete-adobe-project': TIMEOUTS.PROJECT_TEARDOWN, // 900s
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
    // Tracking state for handshake protocol - values assigned but read indirectly

    private isWebviewReady = false;

    private isExtensionReady = false;
    private handshakeComplete = false;
    private stateVersion = 0;
    private disposables: vscode.Disposable[] = [];
    private logger = getLogger();
    private config: Required<CommunicationConfig>;
    private isDisposed = false;

    constructor(panel: vscode.WebviewPanel, config: CommunicationConfig = {}) {
        this.panel = panel;
        this.config = {
            handshakeTimeout: config.handshakeTimeout || TIMEOUTS.QUICK,
            messageTimeout: config.messageTimeout || TIMEOUTS.NORMAL,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || TIMEOUTS.WEBVIEW_RETRY_DELAY,
            enableLogging: config.enableLogging !== false,
        };
    }

    /**
     * Initialize communication with handshake protocol
     */
    async initialize(): Promise<void> {
        // Set up message listener
        this.panel.webview.onDidReceiveMessage(
            (message) => this.handleWebviewMessage(message),
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

                // Flush queued messages
                this.flushMessageQueue();

                resolve();
            });
        });
    }

    /**
     * Send a message to the webview (fire-and-forget)
     *
     * `payload` is `unknown` on purpose: the wire is postMessage, which takes
     * any structured-clonable value, and this manager never inspects payload
     * contents. Typing lives at each CHANNEL's declaration
     * (@/types/webviewPayloads, @/types/webviewRequests), enforced at the
     * sender and the handler — not here in the transport.
     */
    async sendMessage(type: string, payload?: unknown): Promise<void> {
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
     *
     * `payload` is `unknown` for the same reason as {@link sendMessage}.
     */
    async request<T = unknown>(type: string, payload?: unknown): Promise<T> {
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
    on<P = unknown, R = unknown>(
        type: string,
        handler: MessageHandlerFunction<P, R>,
    ): void {
        this.messageHandlers.set(type, handler as MessageHandlerFunction);
    }

    /**
     * Register a one-time message handler
     */
    once<P = unknown, R = unknown>(
        type: string,
        handler: MessageHandlerFunction<P, R>,
    ): void {
        const wrappedHandler: MessageHandlerFunction = (payload: unknown) => {
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
    onStreaming<P = unknown, R = unknown>(
        type: string,
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
        // Mark as disposed to prevent further message sends
        this.isDisposed = true;

        // Clear all timeouts
        this.pendingRequests.forEach((request) => {
            clearTimeout(request.timeout);
        });
        this.pendingRequests.clear();

        // Dispose of event listeners
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];

        // Clear queues
        this.messageQueue = [];
        this.messageHandlers.clear();
    }

    /**
     * Handle incoming message from webview
     */
    private async handleWebviewMessage(message: Message): Promise<void> {
        // Handle special protocol messages
        if (message.type === '__webview_ready__') {
            const handler = this.messageHandlers.get('__webview_ready__');
            if (handler) {
                await handler(message.payload ?? {});
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
                        }).catch((hintError) => {
                            // Timeout hint is non-critical, log and continue
                            if (this.config.enableLogging) {
                                this.logger.warn(
                                    `[WebviewComm] Failed to send timeout hint (non-fatal): ${hintError}`,
                                );
                            }
                        });
                    }
                }

                // CRITICAL FIX (v1.5.0): Properly await async handler results
                // Previously, Promise objects were being sent to UI instead of resolved values
                // This caused "Error Loading Projects" despite successful backend operations
                const result = await handler(message.payload ?? {});

                // If the message has an ID, send a response
                if (message.id && message.expectsResponse) {
                    this.sendRawMessage({
                        id: uuidv4(),
                        type: '__response__',
                        payload: result,
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
        } else {
            // NO HANDLER. Previously this fell through in silence, which is the single
            // mechanism behind an entire class of bug: the webview's request never
            // resolves and the user watches a spinner until it times out — with
            // nothing in the logs naming the cause. It shipped four times in one day
            // on the integrations panel alone (2026-07-31).
            //
            // Fail loudly instead. A named error in the UI and the log points at the
            // real fault (an unregistered type on THIS panel) in seconds, where a
            // hang points nowhere.
            this.logger.error(
                `[WebviewComm] No handler registered for '${message.type}' on this panel. ` +
                    'The webview sent it but nothing answers it — register it in the ' +
                    "panel command's handler map.",
            );
            if (message.id && message.expectsResponse) {
                this.sendRawMessage({
                    id: uuidv4(),
                    type: '__response__',
                    payload: undefined,
                    timestamp: Date.now(),
                    isResponse: true,
                    responseToId: message.id,
                    error: `No handler registered for '${message.type}' on this panel.`,
                });
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
                    this.logger.debug(
                        `[WebviewComm] Retrying message ${message.type} (attempt ${retryCount + 1})`,
                    );
                }

                await sleep(this.config.retryDelay);
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
        // Silently ignore if disposed (prevents error spam during webview transitions)
        if (this.isDisposed) {
            return;
        }

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
        if (this.config.enableLogging && this.messageQueue.length > 0) {
            this.logger.debug(`[WebviewComm] Flushing ${this.messageQueue.length} queued messages`);
        }

        const messages = [...this.messageQueue];
        this.messageQueue = [];

        messages.forEach((message) => {
            this.sendWithRetry(message);
        });
    }
}

/**
 * Factory function for creating communication manager
 *
 * CRITICAL: If initialization fails (e.g., handshake timeout), the manager is
 * disposed to prevent orphaned message listeners. Without this cleanup, subsequent
 * calls would create duplicate listeners, causing handlers to fire multiple times.
 */
export async function createWebviewCommunication(
    panel: vscode.WebviewPanel,
    config?: CommunicationConfig,
): Promise<WebviewCommunicationManager> {
    const manager = new WebviewCommunicationManager(panel, config);
    const logger = getLogger();
    try {
        await manager.initialize();
        return manager;
    } catch (error) {
        // Clean up to prevent orphaned listeners that would cause duplicate handler invocations
        logger.warn(
            '[WebviewComm] Initialization failed, disposing manager to prevent orphaned listeners',
        );
        manager.dispose();
        throw error;
    }
}
