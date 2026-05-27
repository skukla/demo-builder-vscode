import React from 'react';
import { createRoot } from 'react-dom/client';
import { AiOverviewScreen } from './AiOverviewScreen';
import { WebviewApp, WebviewInitData } from '@/core/ui/components/WebviewApp';
import { Project } from '@/types/base';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';

interface AiOverviewInitData extends WebviewInitData {
    project?: Project;
    editPromptId?: string;
}

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <WebviewApp>
        {(initData) => {
            const data = initData as AiOverviewInitData;
            return data?.project
                ? <AiOverviewScreen project={data.project} editPromptId={data.editPromptId} />
                : null;
        }}
    </WebviewApp>,
);
