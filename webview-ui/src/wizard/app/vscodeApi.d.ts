declare global {
    interface Window {
        acquireVsCodeApi: () => VSCodeApi;
    }
}
interface VSCodeApi {
    postMessage(message: Message): void;
    getState<T = unknown>(): T | undefined;
    setState<T = unknown>(state: T): void;
}
interface Message<T = unknown> {
    id: string;
    type: string;
    payload?: T;
    timestamp: number;
    isResponse?: boolean;
    responseToId?: string;
    error?: string;
    expectsResponse?: boolean;
}
declare class VSCodeAPIWrapper {
    private vscodeApi;
    private listeners;
    private initialized;
    private handshakeComplete;
    private readyPromise;
    private readyResolve?;
    private messageQueue;
    private pendingRequests;
    private messageIdCounter;
    constructor();
    private initialize;
    private getApi;
    ready(): Promise<void>;
    postMessage(type: string, payload?: unknown): void;
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
    request<T = unknown>(type: string, payload?: unknown, timeoutMs?: number): Promise<T>;
    private sendRawMessage;
    private generateMessageId;
    private flushMessageQueue;
    onMessage(type: string, handler: (data: unknown) => void): () => void;
    getState<T>(): T | undefined;
    setState<T>(state: T): void;
    requestValidation(field: string, value: string): void;
    reportProgress(step: string, progress: number, message?: string): void;
    requestAuth(force?: boolean): void;
    requestProjects(orgId: string): void;
    createProject(config: unknown): void;
    log(level: 'info' | 'warn' | 'error', message: string): void;
}
export declare const vscode: VSCodeAPIWrapper;
export {};
//# sourceMappingURL=vscodeApi.d.ts.map