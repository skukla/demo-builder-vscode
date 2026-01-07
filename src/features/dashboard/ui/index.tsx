import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectDashboardScreen } from './ProjectDashboardScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
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
        <WebviewApp>
            {(data) => (
                <ProjectDashboardScreen
                    project={data?.project}
                    hasMesh={data?.hasMesh}
                    brandName={data?.brandName}
                    stackName={data?.stackName}
                    isEds={data?.isEds}
                    edsLiveUrl={data?.edsLiveUrl}
                    edsDaLiveUrl={data?.edsDaLiveUrl}
                />
            )}
        </WebviewApp>
    </React.StrictMode>,
);
