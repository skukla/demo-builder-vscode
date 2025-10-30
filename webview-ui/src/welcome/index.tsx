import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewApp } from '../shared/components/WebviewApp';
import { WelcomeScreen } from './WelcomeScreen';
import '../shared/styles/index.css';
import '../shared/styles/vscode-theme.css';
import '../shared/styles/custom-spectrum.css';

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
root.render(
    <React.StrictMode>
        <WebviewApp>
            <WelcomeScreen />
        </WebviewApp>
    </React.StrictMode>
);