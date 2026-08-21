import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigureScreen } from './ConfigureScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
import type { ConfigureInitialData } from '@/types/webviewPayloads';

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
        {(data) => {
            // ONE boundary cast: WebviewInitData is `[key: string]: unknown`, so
            // the init payload is typed here rather than per-prop. The shape is
            // owned by ConfigureProjectWebviewCommand.getInitialData(). Partial
            // because `data` is null until the init message lands.
            const init = (data ?? {}) as Partial<ConfigureInitialData>;
            return init.project && init.componentsData ? (
                <ConfigureScreen
                    {...init}
                    project={init.project}
                    componentsData={init.componentsData}
                />
            ) : null;
        }}
    </WebviewApp>,
);
