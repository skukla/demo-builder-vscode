/**
 * Site Access Webview Entry Point
 *
 * Mounts the Site access screen. Bundle key `siteAccess`
 * (esbuild.config.js WEBVIEW_ENTRIES); opened by `demoBuilder.manageSiteAccess`.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { SiteAccessScreen, type SiteAccessScreenProps } from './SiteAccessScreen';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
// The base layers, as real imports in this entry's graph (see the Data
// Installer entry for why an `@import` inside index.css does not reach the browser).
import '@/core/ui/styles/reset.css';
import '@/core/ui/styles/tokens.css';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/utilities.css';
// .modal-* — the shared Modal shell that confirms a removal.
import '@/core/ui/styles/modal.css';
// The shared UI vocabulary — status text, the search band.
import '@/core/ui/styles/shared-ui.css';
// .inline-notice-* — every notice on this screen.
import '@/core/ui/styles/inline-controls.css';
// .integration-row* — each person is drawn as the house list row.
import '@/core/ui/styles/integration-cards.css';
// .add-card — the dashed "Give access" row.
import '@/core/ui/styles/add-card.css';
// Feature-scoped: only this entry loads it.
import './styles/site-access.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// StrictMode omitted to match the other surfaces: double-invoked effects re-fire
// the initial request.
const root = createRoot(container);
root.render(
    <WebviewApp>
        {(data) => {
            // ONE boundary cast: WebviewInitData is `[key: string]: unknown`. The
            // shape is owned by ShowSiteAccessCommand.getInitialData().
            const init = (data ?? {}) as SiteAccessScreenProps;
            return <SiteAccessScreen {...init} />;
        }}
    </WebviewApp>,
);
