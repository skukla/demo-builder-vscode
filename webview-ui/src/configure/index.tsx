import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewApp } from '@/webview-ui/shared/components/WebviewApp';
import { ConfigureScreen } from './ConfigureScreen';
import '../shared/styles/index.css';
import '../shared/styles/vscode-theme.css';
import '../shared/styles/wizard.css';
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
            {(data) => data?.project && data?.componentsData ? (
                <ConfigureScreen
                    project={data.project}
                    componentsData={data.componentsData}
                    existingEnvValues={data.existingEnvValues}
                />
            ) : null}
        </WebviewApp>
    </React.StrictMode>
);

