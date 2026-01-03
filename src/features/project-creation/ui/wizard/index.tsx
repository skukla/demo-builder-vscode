import { View } from '@/core/ui/components/aria';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WizardContainer, ImportedSettings, EditProjectConfig } from './WizardContainer';
import { WebviewApp, WebviewInitData } from '@/core/ui/components/WebviewApp';
import { ComponentSelection } from '@/types/webview';
// Note: index.css imports utilities/, spectrum/, components/ - do not also import custom-spectrum.css
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';

interface WizardInitData extends WebviewInitData {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    editProject?: EditProjectConfig | null;
    projectsViewMode?: 'cards' | 'rows';
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
        <WebviewApp
            onInit={(_data) => {
                // Initialization complete
            }}
            loadingContent={
                <View padding="size-400">
                    <div>Initializing...</div>
                </View>
            }
        >
            {(initData) => {
                const data = initData as WizardInitData;
                return (
                    <WizardContainer
                        componentDefaults={data?.componentDefaults}
                        wizardSteps={data?.wizardSteps}
                        existingProjectNames={data?.existingProjectNames}
                        importedSettings={data?.importedSettings}
                        editProject={data?.editProject ?? undefined}
                        projectsViewMode={data?.projectsViewMode}
                    />
                );
            }}
        </WebviewApp>
    </React.StrictMode>,
);
