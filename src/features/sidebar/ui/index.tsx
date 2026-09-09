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
// .icon-* — the icon-above-label pattern.
import '@/core/ui/styles/icon-label.css';
// .sidebar-* — this panel's own styles, including its short-panel breakpoint.
import './styles/sidebar.css';
import type { SidebarContext } from '../types';
import { Sidebar } from './Sidebar';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Send message to extension.
 *
 * The shared client, like the other seven bundles (ADR-017 §4). It owns the one
 * permitted `acquireVsCodeApi()` call and queues until the extension completes
 * the handshake, which is why `SidebarProvider` runs a
 * `WebviewCommunicationManager` rather than a bare listener.
 */
function sendMessage(type: string, payload?: unknown): void {
    webviewClient.postMessage(type, payload);
}

/**
 * SidebarApp - Root component for sidebar webview
 */
function SidebarApp(): React.ReactElement {
    const [context, setContext] = useState<SidebarContext>({ type: 'projects' });
    const [isLoading, setIsLoading] = useState(true);

    // Handle messages from extension.
    //
    // The client hands the handler `message.payload`, NOT `message.data` — the
    // provider was changed to send that envelope in the same commit. Reading the
    // wrong one is silent: the sidebar renders its spinner forever.
    useEffect(() => {
        const onContext = (payload: unknown) => {
            const context = (payload as { context?: SidebarContext } | undefined)?.context;
            if (context) {
                setContext(context);
                setIsLoading(false);
            }
        };

        const unsubscribers = [
            webviewClient.onMessage('contextResponse', onContext),
            webviewClient.onMessage('contextUpdate', onContext),
        ];

        // Request initial context. Queued by the client until the handshake lands.
        sendMessage('getContext');

        return () => unsubscribers.forEach((off) => off());
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

    // Handle new chat (New button in AiZone) — starts a fresh conversation
    // rather than resuming, so it picks up the current generated guidance.
    const handleNewAiChat = useCallback(() => {
        sendMessage('newAiChat');
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
                onNewAiChat={handleNewAiChat}
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
