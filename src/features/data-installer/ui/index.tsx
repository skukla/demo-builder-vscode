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
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/custom-spectrum.css';
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
