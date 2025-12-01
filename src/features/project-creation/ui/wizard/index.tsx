import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from '@adobe/react-spectrum';
import { WebviewApp, WebviewInitData } from '@/core/ui/components/WebviewApp';
import { WizardContainer } from './WizardContainer';
import { ComponentSelection } from '@/types/webview';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';

interface WizardInitData extends WebviewInitData {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
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
            onInit={(data) => {
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
                    />
                );
            }}
        </WebviewApp>
    </React.StrictMode>
);
