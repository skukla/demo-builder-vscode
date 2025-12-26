/**
 * VS Code API Wrapper
 *
 * Provides a simple interface for webviews to communicate with the extension.
 * Wraps the WebviewClient for convenience.
 */

import { webviewClient } from './WebviewClient';

// Re-export for consumers that need direct WebviewClient access
export { webviewClient };

/**
 * Simplified vscode API for webview use
 * Provides common operations without requiring direct WebviewClient usage
 */
export const vscode = {
    /**
     * Post a message to the extension
     * @param type - Message type
     * @param payload - Optional message payload
     */
    postMessage: <T = unknown>(type: string, payload?: T) => {
        webviewClient.postMessage(type, payload);
    },

    /**
     * Send a request to the extension and wait for a response
     * @param type - Request type
     * @param payload - Optional request payload
     * @returns Promise that resolves with the response
     */
    request: async <T = unknown>(type: string, payload?: unknown): Promise<T> => {
        return webviewClient.request<T>(type, payload);
    },

    /**
     * Listen for messages from the extension
     * @param type - Message type to listen for
     * @param handler - Callback function to handle the message
     * @returns Unsubscribe function
     */
    onMessage: <T = unknown>(type: string, handler: (data: T) => void): (() => void) => {
        return webviewClient.onMessage(type, (data: unknown) => handler(data as T));
    },

    /**
     * Shorthand for posting 'cancel' message
     */
    cancel: () => {
        webviewClient.postMessage('cancel');
    },

    /**
     * Shorthand for creating a project
     * @param config - Project configuration
     */
    createProject: (config: unknown) => {
        webviewClient.createProject(config);
    },
};
