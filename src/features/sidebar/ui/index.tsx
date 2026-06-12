/**
 * Sidebar Webview Entry Point
 *
 * Entry point for the sidebar webview bundle.
 * Renders the Sidebar component with communication to the extension.
 */

import { Provider, defaultTheme, Flex, ProgressCircle } from '@adobe/react-spectrum';
import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import '@/core/ui/styles/custom-spectrum.css';
import type { SidebarContext } from '../types';
import { Sidebar } from './Sidebar';

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

    // Handle create project
    const handleCreateProject = useCallback(() => {
        sendMessage('createProject');
    }, []);

    // Handle open tools
    const handleOpenTools = useCallback(() => {
        sendMessage('openTools');
    }, []);

    // Handle open help
    const handleOpenHelp = useCallback(() => {
        sendMessage('openHelp');
    }, []);

    // Handle open settings
    const handleOpenSettings = useCallback(() => {
        sendMessage('openSettings');
    }, []);

    // Handle open logs
    const handleOpenLogs = useCallback(() => {
        sendMessage('openLogs');
    }, []);

    // Handle open AI chat (Chat button in AiZone)
    const handleOpenAiChat = useCallback(() => {
        sendMessage('openAiChat');
    }, []);

    // Handle show prompts picker (Prompts button in AiZone)
    const handleShowPrompts = useCallback(() => {
        sendMessage('showPrompts');
    }, []);

    // Handle start demo
    const handleStartDemo = useCallback(() => {
        sendMessage('startDemo');
    }, []);

    // Handle stop demo
    const handleStopDemo = useCallback(() => {
        sendMessage('stopDemo');
    }, []);

    // Handle open dashboard
    const handleOpenDashboard = useCallback(() => {
        sendMessage('openDashboard');
    }, []);

    // Handle open configure
    const handleOpenConfigure = useCallback(() => {
        sendMessage('openConfigure');
    }, []);

    // Handle check updates
    const handleCheckUpdates = useCallback(() => {
        sendMessage('checkUpdates');
    }, []);

    // Apply VSCode dark theme class to body (unified theme system ignores user preferences)
    useEffect(() => {
        document.body.classList.add('vscode-dark');
    }, []);

    if (isLoading) {
        return (
            <Provider theme={defaultTheme} colorScheme="dark" UNSAFE_className="sidebar-provider">
                <Flex
                    alignItems="center"
                    justifyContent="center"
                    UNSAFE_className="sidebar-welcome"
                >
                    <ProgressCircle size="M" isIndeterminate aria-label="Loading" />
                </Flex>
            </Provider>
        );
    }

    return (
        <Provider theme={defaultTheme} colorScheme="dark" UNSAFE_className="sidebar-provider">
            <Sidebar
                context={context}
                onNavigate={handleNavigate}
                onBack={handleBack}
                onCreateProject={handleCreateProject}
                onOpenTools={handleOpenTools}
                onOpenHelp={handleOpenHelp}
                onOpenSettings={handleOpenSettings}
                onOpenLogs={handleOpenLogs}
                onOpenAiChat={handleOpenAiChat}
                onShowPrompts={handleShowPrompts}
                onStartDemo={handleStartDemo}
                onStopDemo={handleStopDemo}
                onOpenDashboard={handleOpenDashboard}
                onOpenConfigure={handleOpenConfigure}
                onCheckUpdates={handleCheckUpdates}
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
