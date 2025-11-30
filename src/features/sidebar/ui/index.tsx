/**
 * Sidebar Webview Entry Point
 *
 * Entry point for the sidebar webview bundle.
 * Renders the Sidebar component with communication to the extension.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Sidebar } from './Sidebar';
import type { SidebarContext } from '../types';

// Acquire VS Code API
declare const acquireVsCodeApi: () => {
    postMessage: (message: unknown) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

/**
 * Send message to extension
 */
function sendMessage(type: string, payload?: unknown): void {
    vscode.postMessage({ type, payload });
}

/**
 * SidebarApp - Root component for sidebar webview
 */
function SidebarApp(): React.ReactElement {
    const [context, setContext] = useState<SidebarContext>({ type: 'projects' });
    const [isLoading, setIsLoading] = useState(true);

    // Handle messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'contextResponse':
                case 'contextUpdate':
                    if (message.data?.context) {
                        setContext(message.data.context);
                        setIsLoading(false);
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        // Request initial context
        sendMessage('getContext');

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Handle navigation
    const handleNavigate = useCallback((target: string) => {
        sendMessage('navigate', { target });
    }, []);

    // Handle back navigation
    const handleBack = useCallback(() => {
        sendMessage('back');
    }, []);

    // Determine color scheme from VS Code theme
    const colorScheme = document.body.classList.contains('vscode-light') ? 'light' : 'dark';

    if (isLoading) {
        return (
            <Provider theme={defaultTheme} colorScheme={colorScheme}>
                <div style={{ padding: '16px', color: 'var(--vscode-foreground)' }}>
                    Loading...
                </div>
            </Provider>
        );
    }

    return (
        <Provider theme={defaultTheme} colorScheme={colorScheme}>
            <Sidebar
                context={context}
                onNavigate={handleNavigate}
                onBack={handleBack}
            />
        </Provider>
    );
}

// Mount the app
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<SidebarApp />);
}
