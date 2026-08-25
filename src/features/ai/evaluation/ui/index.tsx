import React from 'react';
import { createRoot } from 'react-dom/client';
import { EvaluationWorkbench } from './EvaluationWorkbench';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
import type { EvaluationWorkbenchInitialData } from '@/types/webviewPayloads';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

createRoot(container).render(
    <WebviewApp>
        {(data) => {
            // ONE boundary cast, against the shape the command's getInitialData
            // owns. Partial because `data` is null until the init message lands.
            const init = (data ?? {}) as Partial<EvaluationWorkbenchInitialData>;
            return init.project ? (
                <EvaluationWorkbench project={init.project} initialMode={init.mode} />
            ) : null;
        }}
    </WebviewApp>,
);
