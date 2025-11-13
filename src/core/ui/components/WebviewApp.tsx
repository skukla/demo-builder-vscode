/**
 * WebviewApp
 *
 * Shared root component for all VS Code webview applications.
 * Handles common initialization logic:
 * - Theme synchronization
 * - Handshake protocol with extension
 * - Spectrum Provider setup
 */

import React, { useEffect, useState, useRef, ReactNode } from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { webviewClient } from '../utils/WebviewClient';
import { ThemeMode } from '@/types/webview';

export interface WebviewAppProps {
    /** Child components to render, or render function that receives initialization data */
    children: ReactNode | ((data: any) => ReactNode);
    /** Optional callback when initialization data is received from extension */
    onInit?: (data: any) => void;
    /** Optional loading content while waiting for init */
    loadingContent?: ReactNode;
    /** Optional className for Provider */
    className?: string;
}

/**
 * WebviewApp Component
 *
 * Wraps webview content with common initialization logic.
 * All webviews should use this as their root component.
 *
 * Supports two patterns:
 * 1. Static children (for simple webviews with no initialization data)
 * 2. Render props (for webviews that need initialization data)
 *
 * @example
 * ```tsx
 * // Pattern 1: Static children (simple webviews)
 * root.render(
 *   <WebviewApp>
 *     <WelcomeScreen />
 *   </WebviewApp>
 * );
 *
 * // Pattern 2: Render props (webviews with initialization data)
 * root.render(
 *   <WebviewApp>
 *     {(data) => (
 *       <ConfigureScreen
 *         project={data?.project}
 *         componentsData={data?.componentsData}
 *       />
 *     )}
 *   </WebviewApp>
 * );
 *
 * // Optional: onInit callback for side effects
 * root.render(
 *   <WebviewApp onInit={(data) => console.log('Initialized', data)}>
 *     {(data) => <ProjectDashboard project={data?.project} />}
 *   </WebviewApp>
 * );
 * ```
 */
export function WebviewApp({
    children,
    onInit,
    loadingContent = null,
    className = 'app-container'
}: WebviewAppProps) {
    const [theme, setTheme] = useState<ThemeMode>('light');
    const [isReady, setIsReady] = useState(false);
    const [initData, setInitData] = useState<any>(null);

    // Track whether we've sent ready message (prevent StrictMode double-send)
    const readySentRef = useRef(false);

    useEffect(() => {
        console.log('[WebviewApp] Component mounted');

        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');

        // Listen for initialization from extension (set up listener BEFORE sending ready)
        const unsubscribeInit = webviewClient.onMessage('init', (data) => {
            console.log('[WebviewApp] Received init message:', data);

            const initData = data as any;
            if (initData.theme) {
                console.log('[WebviewApp] Setting theme:', initData.theme);
                setTheme(initData.theme);
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(initData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }

            // Store initialization data for render props
            setInitData(initData);

            // Call onInit callback if provided
            if (onInit) {
                onInit(initData);
            }

            console.log('[WebviewApp] Setting isReady = true');
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = webviewClient.onMessage('theme-changed', (data) => {
            const themeData = data as any;
            setTheme(themeData.theme);
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(themeData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Wait for handshake, then send ready message to trigger init (guard prevents StrictMode double-send)
        console.log('[WebviewApp] Waiting for handshake completion');
        webviewClient.ready().then(() => {
            if (!readySentRef.current) {
                readySentRef.current = true;
                console.log('[WebviewApp] Handshake complete, sending ready message');
                webviewClient.postMessage('ready');
            } else {
                console.log('[WebviewApp] Handshake complete, but ready already sent (StrictMode remount)');
            }
        });

        return () => {
            unsubscribeInit();
            unsubscribeTheme();
        };
    }, [onInit]);

    if (!isReady) {
        console.log('[WebviewApp] Not ready yet, showing loading content');
        return loadingContent;
    }

    console.log('[WebviewApp] Ready! Rendering Provider with theme:', theme);

    // Support render props pattern
    const content: ReactNode = typeof children === 'function' ? children(initData) : children;

    console.log('[Provider] About to render content');

    return (
        <Provider
            theme={defaultTheme}
            colorScheme={theme}
            isQuiet
            UNSAFE_className={className}
        >
            {content}
        </Provider>
    );
}
