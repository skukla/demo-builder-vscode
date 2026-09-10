import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigureScreen } from './ConfigureScreen';
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
// Step/form scaffolding shared with the wizard and the Data Installer.
import '@/core/ui/styles/step-scaffold.css';
// .vsteplist-* — the vertical step list, shared with the wizard.
import '@/core/ui/styles/vstep-list.css';
// The shared UI vocabulary — 19 small families. Seven of the eight entries.
import '@/core/ui/styles/shared-ui.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/utilities.css';
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
