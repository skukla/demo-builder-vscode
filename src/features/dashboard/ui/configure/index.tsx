import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigureScreen, ComponentsData } from './ConfigureScreen';
import { WebviewApp, WebviewInitData } from '@/core/ui/components/WebviewApp';
import { AuthoringExperience, Project } from '@/types/base';
import type { DeployableCatalogEntry } from '@/types/deployables';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';

interface ConfigureInitData extends WebviewInitData {
    project?: Project;
    componentsData?: ComponentsData;
    existingEnvValues?: Record<string, Record<string, string>>;
    existingProjectNames?: string[];
    isEds?: boolean;
    authoringExperience?: AuthoringExperience;
    deployableCatalog?: DeployableCatalogEntry[];
    providedEnvVars?: Record<string, string>;
    deployableSecretFlags?: Record<string, Record<string, boolean>>;
}

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
// Note: StrictMode removed to prevent double-execution of effects in development
const root = createRoot(container);
root.render(
    <WebviewApp>
        {(initData) => {
            const data = initData as ConfigureInitData;
            return data?.project && data?.componentsData ? (
                <ConfigureScreen
                    project={data.project}
                    componentsData={data.componentsData}
                    existingEnvValues={data.existingEnvValues}
                    existingProjectNames={data.existingProjectNames}
                    isEds={data.isEds}
                    authoringExperience={data.authoringExperience}
                    deployableCatalog={data.deployableCatalog}
                    providedEnvVars={data.providedEnvVars}
                    deployableSecretFlags={data.deployableSecretFlags}
                />
            ) : null;
        }}
    </WebviewApp>,
);
