import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigureScreen, ComponentsData } from './ConfigureScreen';
import { WebviewApp, WebviewInitData } from '@/core/ui/components/WebviewApp';
import { Project } from '@/types/base';
// Note: index.css imports utilities/, spectrum/, components/ - do not also import custom-spectrum.css
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';

interface ConfigureInitData extends WebviewInitData {
    project?: Project;
    componentsData?: ComponentsData;
    existingEnvValues?: Record<string, Record<string, string>>;
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
        <WebviewApp>
            {(initData) => {
                const data = initData as ConfigureInitData;
                return data?.project && data?.componentsData ? (
                    <ConfigureScreen
                        project={data.project}
                        componentsData={data.componentsData}
                        existingEnvValues={data.existingEnvValues}
                    />
                ) : null;
            }}
        </WebviewApp>
    </React.StrictMode>,
);
