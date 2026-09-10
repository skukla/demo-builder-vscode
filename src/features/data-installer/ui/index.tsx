/**
 * Data Installer Webview Entry Point
 *
 * Mounts the Data Installer surface. Bundle key `dataInstaller`
 * (esbuild.config.js WEBVIEW_ENTRIES); opened by `demoBuilder.showDataInstaller`.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { DataInstallerScreen, type DataInstallerScreenProps } from './DataInstallerScreen';
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
import '@/core/ui/styles/utilities.css';
// .datapack-* rules, moved out of utilities.css by the CSS migration.
// The wizard and the data installer both render a component using them; kept
// separate from data-installer.css so the wizard does not drag in that
// surface's unrelated rules.
import './styles/datapack.css';
// .integration-* — DatapackDetailPanel renders an integration card.
import '@/core/ui/styles/integration-cards.css';
// .modal-* — the shared Modal shell.
import '@/core/ui/styles/modal.css';
// Step/form scaffolding shared with the wizard and Configure.
import '@/core/ui/styles/step-scaffold.css';
// The shared UI vocabulary — 19 small families. Seven of the eight entries.
import '@/core/ui/styles/shared-ui.css';
// .db-* — the shared detail drawer.
import '@/core/ui/styles/drawer.css';
// Feature-scoped: this is the ONLY entry that loads it, so its classes exist in
// this bundle and nowhere else.
import './styles/data-installer.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// StrictMode omitted to match the other surfaces: double-invoked effects re-fire
// the initial requests.
const root = createRoot(container);
root.render(
    <WebviewApp>
        {(data) => {
            // ONE boundary cast: WebviewInitData is `[key: string]: unknown`, so the
            // init payload is typed here rather than per-prop. The shape is owned by
            // ShowDataInstallerCommand.getInitialData().
            const init = (data ?? {}) as DataInstallerScreenProps;
            return <DataInstallerScreen {...init} />;
        }}
    </WebviewApp>,
);
