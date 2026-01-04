/**
 * WebviewApp
 *
 * Shared root component for all VS Code webview applications.
 * Handles common initialization logic:
 * - Theme synchronization
 * - Handshake protocol with extension
 * - CSS class-based theming (replaces Spectrum Provider)
 */

import React, { useEffect, useState, useRef, ReactNode } from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';

const log = webviewLogger('WebviewApp');

export interface WebviewInitData {
    [key: string]: unknown;
}

export interface WebviewAppProps {
    /** Child components to render, or render function that receives initialization data */
    children: ReactNode | ((data: WebviewInitData | null) => ReactNode);
    /** Optional callback when initialization data is received from extension */
    onInit?: (data: WebviewInitData) => void;
    /** Optional loading content while waiting for init */
    loadingContent?: ReactNode;
    /** Optional className for wrapper div */
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
    className = 'app-container',
}: WebviewAppProps) {
    const [isReady, setIsReady] = useState(false);
    const [initData, setInitData] = useState<WebviewInitData | null>(null);

    // Track whether we've sent ready message (prevent StrictMode double-send)
    const readySentRef = useRef(false);

    useEffect(() => {
        log.debug('Component mounted');

        // Apply VSCode dark theme class to body (unified theme system ignores user preferences)
        // Note: Both classes are needed:
        // - 'vscode-dark' - Triggers vscode-theme.css body background/color rules
        // - 'spectrum--dark' - Enables Spectrum token definitions (--spectrum-global-color-*)
        //   that CSS Modules rely on (was previously provided by React Spectrum Provider)
        document.body.classList.add('vscode-dark', 'spectrum--dark');

        // Listen for initialization from extension (set up listener BEFORE sending ready)
        const unsubscribeInit = webviewClient.onMessage('init', (data) => {
            log.debug('Received init message:', data);

            const initData = data as WebviewInitData;

            // Store initialization data for render props
            setInitData(initData);

            // Call onInit callback if provided
            if (onInit) {
                onInit(initData);
            }

            log.debug('Setting isReady = true');
            setIsReady(true);
        });

        // Wait for handshake, then send ready message to trigger init (guard prevents StrictMode double-send)
        log.debug('Waiting for handshake completion');
        webviewClient.ready().then(() => {
            if (!readySentRef.current) {
                readySentRef.current = true;
                log.debug('Handshake complete, sending ready message');
                webviewClient.postMessage('ready');
            } else {
                log.debug('Handshake complete, but ready already sent (StrictMode remount)');
            }
        });

        return () => {
            unsubscribeInit();
        };
    }, [onInit]);

    if (!isReady) {
        log.debug('Not ready yet, showing loading content');
        return loadingContent;
    }

    log.debug('Ready! Rendering with dark theme (unified theme system)');

    // Support render props pattern
    const content: ReactNode = typeof children === 'function' ? children(initData) : children;

    log.debug('About to render content');

    return (
        <div className={cn('webview-app', className)}>
            {content}
        </div>
    );
}
