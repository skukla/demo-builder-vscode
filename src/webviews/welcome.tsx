import React from 'react';
import { createRoot } from 'react-dom/client';
import { WelcomeApp } from './welcome-app';
import './styles/index.css';
import './styles/vscode-theme.css';

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