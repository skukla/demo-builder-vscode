import React from 'react';
import { createRoot } from 'react-dom/client';
import { AiOverviewScreen } from './AiOverviewScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
// The base layers. They arrive as REAL imports, in this entry's graph, because
// that is the only delivery this build resolves. index.css used to pull them in
// with `@import './reset.css'` — which webpack's css-loader inlined at build
// time, and which the esbuild plugin that replaced it (580495214, 2026-04-13)
// passes through as literal text. The browser then tried to fetch them relative
// to a vscode-webview:// URL and got nothing, so the reset and every design
// token were absent from all eight bundles for five months. ADR-017 §6 asks for
// exactly this: a stylesheet belongs to its bundle's GRAPH.
import '@/core/ui/styles/reset.css';
import '@/core/ui/styles/tokens.css';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/utilities.css';
// .ai-* rules, moved out of utilities.css by the CSS migration. Three
// entries reach a component using them, so all three import it.
import '../styles/ai.css';
// .modal-* — the shared Modal shell.
import '@/core/ui/styles/modal.css';
// The shared UI vocabulary — 19 small families. Seven of the eight entries.
import '@/core/ui/styles/shared-ui.css';
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
