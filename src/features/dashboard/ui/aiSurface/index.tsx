import React from 'react';
import { createRoot } from 'react-dom/client';
import { AiOverviewScreen } from './AiOverviewScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
import type { AiOverviewInitialData } from '@/types/webviewPayloads';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <WebviewApp>
        {(data) => {
            // ONE boundary cast against the shape ShowAiCommand.getInitialData()
            // owns. Partial because `data` is null until the init message lands.
            const init = (data ?? {}) as Partial<AiOverviewInitialData>;
            return init.project ? <AiOverviewScreen project={init.project} /> : null;
        }}
    </WebviewApp>,
);
