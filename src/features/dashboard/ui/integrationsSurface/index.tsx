/**
 * Integrations Surface Webview Entry Point
 *
 * Mounts the dedicated integrations screen. Bundle key `integrations`
 * (esbuild.config.js WEBVIEW_ENTRIES); opened by `demoBuilder.showIntegrations`.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { IntegrationsScreen, type IntegrationsScreenProps } from './IntegrationsScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/custom-spectrum.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Note: StrictMode omitted to match the other surfaces (double-invoked effects
// re-fire the status request).
const root = createRoot(container);
root.render(
    <WebviewApp>
        {(data) => {
            // ONE boundary cast: WebviewInitData is `[key: string]: unknown`, so
            // the init payload is typed here rather than per-prop. The shape is
            // owned by ShowIntegrationsCommand.getInitialData().
            const init = (data ?? {}) as IntegrationsScreenProps;
            return <IntegrationsScreen {...init} />;
        }}
    </WebviewApp>,
);
