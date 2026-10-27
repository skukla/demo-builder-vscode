import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigureScreen } from './ConfigureScreen';
import { keyForInit } from './initKey';
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
// .inline-notice-* — the store pickers' "Guests won't see any products in this
// store view." line (EDS-46) is an InlineNotice, and this screen renders the
// same pickers as the wizard.
import '@/core/ui/styles/inline-controls.css';
// .modal-* — the storefront Republish is told in the shared progress modal.
import '@/core/ui/styles/modal.css';
// WorkRow, that modal's rows of what a run changed, named by CheckboxRow's label and detail
// classes (ADR-017 §6).
import '@/core/ui/styles/work-row.css';
import '@/core/ui/styles/checkbox-row.css';
// The block library cards on the Block Libraries tab are the wizard's picker (EDS-39),
// and a sheet reaches only the bundles whose entry imports it. `.choice-*` is the
// cards. wizard-misc.css is here for ONE rule, `.settings-link`, the picker's
// "Configure custom libraries in Settings" line; its other families are the
// wizard's and nothing on this screen names them.
import '@/features/project-creation/ui/styles/choice-cards.css';
import '@/features/project-creation/ui/styles/wizard-misc.css';
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
                    // A fresh `init` (Configure re-opened) remounts the screen.
                    key={keyForInit(init)}
                    {...init}
                    project={init.project}
                    componentsData={init.componentsData}
                />
            ) : null;
        }}
    </WebviewApp>,
);
