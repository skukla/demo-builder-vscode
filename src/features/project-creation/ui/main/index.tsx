/**
 * Webpack Entry Point: Project Creation Wizard
 *
 * This file serves as the webpack entry point for the Project Creation wizard.
 * It handles React mounting, theme setup, and VS Code API initialization.
 *
 * WHY THIS IS HERE:
 * - Webpack requires separate entry points for each webview
 * - Entry points are co-located with the feature they serve
 * - All feature UI lives together in features/project-creation/ui/
 *
 * STRUCTURE:
 * - entries/ → Webpack entry points (this file)
 * - wizard/ → Wizard container and navigation
 * - steps/ → Individual wizard step components
 * - App.tsx → Root React component
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/features/project-creation/ui/App';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/design-system/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);