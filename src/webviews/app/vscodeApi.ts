// VSCode API wrapper for webview communication with handshake protocol

declare global {
    interface Window {
        acquireVsCodeApi: () => VSCodeApi;
    }
}

interface VSCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

interface Message {
    id: string;
    type: string;
    payload?: any;
    timestamp: number;
    isResponse?: boolean;
    responseToId?: string;
    error?: string;
    expectsResponse?: boolean;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: number; // Browser setTimeout returns number
}

class VSCodeAPIWrapper {
    private vscodeApi: VSCodeApi | null = null;
    private listeners: Map<string, Set<(data: any) => void>>;
    private initialized = false;
    private handshakeComplete = false;
    private readyPromise: Promise<void>;
    private readyResolve?: () => void;
    private messageQueue: Message[] = [];
    private pendingRequests = new Map<string, PendingRequest>();
    private messageIdCounter = 0;

    constructor() {
        // Initialize listeners map immediately
        this.listeners = new Map<string, Set<(data: any) => void>>();
        
        // Create ready promise
        this.readyPromise = new Promise<void>((resolve) => {
            this.readyResolve = resolve;
        });
        
        // Initialize immediately to set up handshake
        this.initialize();
    }

    private initialize(): void {
        if (this.initialized) return;
        
        // Get the VS Code API
        this.vscodeApi = window.acquireVsCodeApi();
        this.initialized = true;

        // Set up message listener
        window.addEventListener('message', (event) => {
            const message = event.data as Message;
            
            // Handle handshake protocol
            if (message.type === '__extension_ready__') {
                // Extension is ready, send webview ready signal
                this.sendRawMessage({
                    id: this.generateMessageId(),
                    type: '__webview_ready__',
                    timestamp: Date.now()
                });
                return;
            }
            
            if (message.type === '__handshake_complete__') {
                this.handshakeComplete = true;
                if (this.readyResolve) {
                    this.readyResolve();
                }
                // Flush queued messages
                this.flushMessageQueue();
                return;
            }
            
            // Handle timeout hints from backend (backend specifies required timeout)
            if (message.type === '__timeout_hint__' && message.payload) {
                const { requestId, timeout: newTimeout } = message.payload;
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                    // Clear old timeout and set new one with backend-specified duration
                    clearTimeout(pending.timeout);
                    pending.timeout = setTimeout(() => {
                        this.pendingRequests.delete(requestId);
                        pending.reject(new Error(`Request timeout (${newTimeout}ms)`));
                    }, newTimeout);
                }
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
            if (message.type && this.listeners) {
                const handlers = this.listeners.get(message.type);
                if (handlers) {
                    handlers.forEach(handler => {
                        const result = handler(message.payload);
                        
                        // Send response if expected
                        if (message.expectsResponse && message.id) {
                            this.sendRawMessage({
                                id: this.generateMessageId(),
                                type: '__response__',
                                payload: result,
                                timestamp: Date.now(),
                                isResponse: true,
                                responseToId: message.id
                            });
                        }
                    });
                }
            }
            
            // Note: Acknowledgment is sent by the extension side (webviewCommunicationManager)
            // to avoid duplicate acknowledgements
        });
    }

    private getApi(): VSCodeApi {
        if (!this.vscodeApi) {
            this.initialize();
        }
        return this.vscodeApi!;
    }

    // Wait for handshake to complete
    public ready(): Promise<void> {
        return this.readyPromise;
    }
    
    // Send message to extension
    public postMessage(type: string, payload?: any): void {
        const message: Message = {
            id: this.generateMessageId(),
            type,
            payload,
            timestamp: Date.now()
        };
        
        if (!this.handshakeComplete) {
            this.messageQueue.push(message);
            return;
        }
        
        this.sendRawMessage(message);
    }
    
    /**
     * Send request and wait for response
     * 
     * Timeout is automatically extended if backend sends a __timeout_hint__ message.
     * This allows backend operations to specify their own timeout requirements based on
     * the operation being performed (e.g., mesh creation needs 5 minutes).
     * 
     * @param type - Request type
     * @param payload - Request payload
     * @param timeoutMs - Initial timeout (default 30s, may be extended by backend)
     */
    public async request<T = any>(type: string, payload?: any, timeoutMs: number = 30000): Promise<T> {
        const message: Message = {
            id: this.generateMessageId(),
            type,
            payload,
            timestamp: Date.now(),
            expectsResponse: true
        };
        
        if (!this.handshakeComplete) {
            await this.ready();
        }
        
        return new Promise((resolve, reject) => {
            // Set up initial timeout (may be extended by backend timeout hint)
            let timeout = setTimeout(() => {
                this.pendingRequests.delete(message.id);
                reject(new Error(`Request timeout: ${type}`));
            }, timeoutMs);
            
            // Track pending request
            this.pendingRequests.set(message.id, {
                resolve,
                reject,
                timeout
            });
            
            // Send the request
            this.sendRawMessage(message);
        });
    }
    
    // Internal: Send raw message
    private sendRawMessage(message: Message): void {
        this.getApi().postMessage(message);
    }
    
    // Internal: Generate unique message ID
    private generateMessageId(): string {
        return `msg_${Date.now()}_${++this.messageIdCounter}`;
    }
    
    // Internal: Flush queued messages after handshake
    private flushMessageQueue(): void {
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        messages.forEach(msg => this.sendRawMessage(msg));
    }

    // Subscribe to messages from extension
    public onMessage(type: string, handler: (data: any) => void): () => void {
        // Initialize if not already done to set up event listener
        if (!this.initialized) {
            this.initialize();
        }
        
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(handler);

        // Return unsubscribe function
        return () => {
            const handlers = this.listeners.get(type);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    // State management
    public getState<T>(): T | undefined {
        return this.getApi().getState() as T;
    }

    public setState<T>(state: T): void {
        this.getApi().setState(state);
    }

    // Helper methods for common operations
    public requestValidation(field: string, value: string): void {
        this.postMessage('validate', { field, value });
    }

    public reportProgress(step: string, progress: number, message?: string): void {
        this.postMessage('progress', { step, progress, message });
    }

    public requestAuth(force: boolean = false): void {
        this.postMessage('authenticate', { force });
    }


    public requestProjects(orgId: string): void {
        this.postMessage('get-projects', { orgId });
    }

    public createProject(config: any): void {
        this.postMessage('create-project', config);
    }

    public log(level: 'info' | 'warn' | 'error', message: string): void {
        this.postMessage('log', { level, message });
    }
}

// Create singleton instance
export const vscode = new VSCodeAPIWrapper();