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
// .ai-* rules, moved out of utilities.css by the CSS migration. Three
// entries reach a component using them, so all three import it.
import '../styles/ai.css';
// .intflow-* — the Add Integration modal, rendered here through
// AddIntegrationFlowAdapter and on the wizard's Integrations area. Both entries
// import it; neither owns it alone.
import '@/features/project-creation/ui/styles/add-integration-flow.css';
// .integration-* — the card and its detail panel.
import '@/core/ui/styles/integration-cards.css';
// .modal-* — the shared Modal shell.
import '@/core/ui/styles/modal.css';
// The shared UI vocabulary — 19 small families. Seven of the eight entries.
import '@/core/ui/styles/shared-ui.css';
// .integrations-* — this surface's own shell and grid.
import '../styles/integrations.css';
// .choice-* — project-creation's option cards, rendered here too.
import '@/features/project-creation/ui/styles/choice-cards.css';
// .db-* — the shared detail drawer.
import '@/core/ui/styles/drawer.css';
// .inline-notice-*, .inline-rename-* — two small shared components.
import '@/core/ui/styles/inline-controls.css';

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
