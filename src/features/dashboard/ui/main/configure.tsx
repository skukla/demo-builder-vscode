/**
 * Webpack Entry Point: Configure Screen
 *
 * This file serves as the webpack entry point for the Configure screen.
 * It handles React mounting, theme setup, and VS Code API initialization.
 *
 * WHY THIS IS HERE:
 * - Webpack requires separate entry points for each webview
 * - Entry points are co-located with the feature they serve
 * - All feature UI lives together in features/dashboard/ui/
 *
 * STRUCTURE:
 * - entries/ → Webpack entry points (this file)
 * - ConfigureScreen.tsx → Configuration editor screen
 * - ProjectDashboardScreen.tsx → Main dashboard screen component
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/ConfigureScreen';
import { vscode } from '@/core/ui/vscode-api';
import { ThemeMode, Project } from '@/core/ui/types';
import type { ComponentRegistry } from '@/types/components';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/design-system/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';

function ConfigureApp() {
    const [theme, setTheme] = useState<ThemeMode>('dark');
    const [isReady, setIsReady] = useState(false);
    const [projectData, setProjectData] = useState<Project | null>(null);
    const [componentsData, setComponentsData] = useState<ComponentRegistry | null>(null);
    const [existingEnvValues, setExistingEnvValues] = useState<Record<string, string> | null>(null);

    useEffect(() => {
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');
        
        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data) => {
            if (data.theme) {
                setTheme(data.theme);
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }
            if (data.project) {
                setProjectData(data.project);
            }
            if (data.componentsData) {
                setComponentsData(data.componentsData);
            }
            if (data.existingEnvValues) {
                setExistingEnvValues(data.existingEnvValues);
            }
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data) => {
            setTheme(data.theme);
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Request initialization
        vscode.postMessage('ready');

        return () => {
            unsubscribe();
            unsubscribeTheme();
        };
    }, []);

    if (!isReady || !projectData || !componentsData) {
        return null;
    }

    return (
        <Provider 
            theme={defaultTheme} 
            colorScheme={theme}
            isQuiet
            UNSAFE_className="app-container"
        >
            <ConfigureScreen 
                project={projectData} 
                componentsData={componentsData}
                existingEnvValues={existingEnvValues}
            />
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
        <ConfigureApp />
    </React.StrictMode>
);

