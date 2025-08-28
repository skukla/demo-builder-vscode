// VSCode API wrapper for webview communication

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

class VSCodeAPIWrapper {
    private vscodeApi: VSCodeApi | null = null;
    private listeners: Map<string, Set<(data: any) => void>>;
    private initialized = false;

    constructor() {
        // Initialize listeners map immediately
        this.listeners = new Map<string, Set<(data: any) => void>>();
    }

    private initialize(): void {
        if (this.initialized) return;
        
        // Get the VS Code API
        this.vscodeApi = window.acquireVsCodeApi();
        this.initialized = true;

        // Set up message listener
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type && this.listeners) {
                const handlers = this.listeners.get(message.type);
                if (handlers) {
                    handlers.forEach(handler => handler(message.payload));
                }
            }
        });
    }

    private getApi(): VSCodeApi {
        if (!this.vscodeApi) {
            this.initialize();
        }
        return this.vscodeApi!;
    }

    // Send message to extension
    public postMessage(type: string, payload?: any): void {
        this.getApi().postMessage({ type, payload });
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

    public requestOrganizations(): void {
        this.postMessage('get-organizations');
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