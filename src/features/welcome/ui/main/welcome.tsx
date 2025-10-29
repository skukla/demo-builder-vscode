/**
 * Webpack Entry Point: Welcome Screen
 *
 * This file serves as the webpack entry point for the Welcome screen.
 * It handles React mounting, theme setup, and VS Code API initialization.
 *
 * WHY THIS IS HERE:
 * - Webpack requires separate entry points for each webview
 * - Entry points are co-located with the feature they serve
 * - All feature UI lives together in features/welcome/ui/
 *
 * STRUCTURE:
 * - entries/ → Webpack entry points (this file)
 * - WelcomeScreen.tsx → Main welcome screen component
 * - EmptyState.tsx → Empty state for no projects
 * - ProjectCard.tsx → Project card component
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { WelcomeScreen } from '@/features/welcome/ui/WelcomeScreen';
import { vscode } from '@/core/ui/vscode-api';
import { ThemeMode } from '@/webview-ui/shared/types';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/custom-spectrum.css';

function WelcomeApp() {
    const [theme, setTheme] = useState<ThemeMode>('dark');

    useEffect(() => {
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data) => {
            setTheme(data.theme);
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        return () => {
            unsubscribeTheme();
        };
    }, []);

    return (
        <Provider
            theme={defaultTheme}
            colorScheme={theme}
            isQuiet
            UNSAFE_className="app-container"
        >
            <WelcomeScreen theme={theme} />
        </Provider>
    );
}

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
root.render(
    <React.StrictMode>
        <WelcomeApp />
    </React.StrictMode>
);