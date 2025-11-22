import React, { createContext, useContext, ReactNode } from 'react';
import { webviewClient as vscodeSingleton } from '../utils/WebviewClient';

interface VSCodeContextValue {
    /** Post a message to the extension (fire-and-forget) */
    postMessage: (type: string, payload?: unknown) => void;
    /** Send a request and wait for a response */
    request: <T = unknown>(type: string, payload?: unknown, timeoutMs?: number) => Promise<T>;
    /** Subscribe to messages from the extension */
    onMessage: (type: string, handler: (data: unknown) => void) => () => void;
    /** Wait for handshake to complete */
    ready: () => Promise<void>;
    /** Get persisted state */
    getState: <T>() => T | undefined;
    /** Set persisted state */
    setState: <T>(state: T) => void;
}

const VSCodeContext = createContext<VSCodeContextValue | undefined>(undefined);

export interface VSCodeProviderProps {
    children: ReactNode;
}

/**
 * Context Provider: VSCode API
 *
 * Provides access to VS Code webview communication API.
 * Wraps the vscodeApi singleton for easy consumption via useVSCode hook.
 *
 * @example
 * ```tsx
 * <VSCodeProvider>
 *   <App />
 * </VSCodeProvider>
 * ```
 */
export const VSCodeProvider: React.FC<VSCodeProviderProps> = ({ children }) => {
    const value: VSCodeContextValue = {
        postMessage: vscodeSingleton.postMessage.bind(vscodeSingleton),
        request: vscodeSingleton.request.bind(vscodeSingleton),
        onMessage: vscodeSingleton.onMessage.bind(vscodeSingleton),
        ready: vscodeSingleton.ready.bind(vscodeSingleton),
        getState: vscodeSingleton.getState.bind(vscodeSingleton),
        setState: vscodeSingleton.setState.bind(vscodeSingleton)
    };

    return (
        <VSCodeContext.Provider value={value}>
            {children}
        </VSCodeContext.Provider>
    );
};

/**
 * Hook: useVSCode
 *
 * Access the VS Code webview API.
 * Must be used within a VSCodeProvider.
 *
 * @example
 * ```tsx
 * const { postMessage, request } = useVSCode();
 *
 * // Fire-and-forget message
 * postMessage('action', { data: 'value' });
 *
 * // Request-response pattern
 * const result = await request('getData', { id: 123 });
 * ```
 */
export const useVSCode = (): VSCodeContextValue => {
    const context = useContext(VSCodeContext);
    if (!context) {
        throw new Error('useVSCode must be used within a VSCodeProvider');
    }
    return context;
};
