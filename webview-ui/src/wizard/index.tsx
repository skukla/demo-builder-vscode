import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from '@adobe/react-spectrum';
import { WebviewApp } from '@/webview-ui/shared/components/WebviewApp';
import { WizardContainer } from './components/WizardContainer';
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
            {(data) => (
                <WizardContainer
                    componentDefaults={data?.componentDefaults}
                    wizardSteps={data?.wizardSteps}
                />
            )}
        </WebviewApp>
    </React.StrictMode>
);