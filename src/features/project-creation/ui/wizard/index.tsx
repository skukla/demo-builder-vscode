import { View } from '@adobe/react-spectrum';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WizardContainer } from './WizardContainer';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
import type { WizardInitialData } from '@/types/webviewPayloads';

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
// Note: StrictMode removed to prevent double-execution of effects in development
// This was causing 3x handler execution and noisy logs. See research findings.
root.render(
    <WebviewApp
        // The ONLY panel with post-handshake work to ask for: `ready` makes the
        // extension load the component definitions the selection steps need.
        notifyReady
        onInit={(_data) => {
            // Initialization complete
        }}
        loadingContent={
            <View padding="size-400">
                <div>Initializing...</div>
            </View>
        }
    >
        {(data) => {
            // ONE boundary cast: the shape is owned by
            // CreateProjectWebviewCommand.getInitialData(). Partial because
            // `data` is null until the init message lands. Wire `null`s become
            // `undefined` where a container prop models absence that way.
            const init = (data ?? {}) as Partial<WizardInitialData>;
            return (
                <WizardContainer
                    componentDefaults={init.componentDefaults ?? undefined}
                    wizardSteps={init.wizardSteps ?? undefined}
                    existingProjectNames={init.existingProjectNames}
                    importedSettings={init.importedSettings}
                    editProject={init.editProject ?? undefined}
                    projectsViewMode={init.projectsViewMode}
                    blockLibraryDefaults={init.blockLibraryDefaults}
                    customBlockLibraryDefaults={init.customBlockLibraryDefaults}
                />
            );
        }}
    </WebviewApp>,
);
