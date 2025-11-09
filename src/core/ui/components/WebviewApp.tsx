/**
 * WebviewApp
 *
 * Shared root component for all VS Code webview applications.
 * Handles common initialization logic:
 * - Theme synchronization
 * - Handshake protocol with extension
 * - Spectrum Provider setup
 */

import React, { useEffect, useState, ReactNode } from 'react';
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

    useEffect(() => {
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');

        // Listen for initialization from extension
        const unsubscribeInit = webviewClient.onMessage('init', (data) => {
            const initData = data as any;
            if (initData.theme) {
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

            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = webviewClient.onMessage('theme-changed', (data) => {
            const themeData = data as any;
            setTheme(themeData.theme);
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(themeData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Request initialization
        webviewClient.postMessage('ready');

        return () => {
            unsubscribeInit();
            unsubscribeTheme();
        };
    }, [onInit]);

    if (!isReady) {
        return loadingContent;
    }

    // Support render props pattern
    const content = typeof children === 'function' ? children(initData) : children;

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
