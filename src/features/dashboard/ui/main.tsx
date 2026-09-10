/**
 * Project Dashboard Webview Entry Point
 *
 * Mounts the project dashboard. Bundle key `dashboard`
 * (esbuild.config.js WEBVIEW_ENTRIES); opened by `demoBuilder.showDashboard`.
 *
 * Named `main.tsx`, NOT `index.tsx`: this directory also has an `index.ts`
 * barrel, and tsc's include globs keep only ONE file per basename (`.ts` wins
 * over `.tsx`), so an `index.tsx` here is silently never typechecked. That gap
 * hid a dead `brandName` wire read for months while the producer sent
 * `packageName`.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectDashboardScreen, type ProjectDashboardScreenProps } from './ProjectDashboardScreen';
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
import './styles/ai.css';
// .dashboard-* rules, moved out of utilities.css by the same migration.
// This is the ONLY entry whose graph reaches a component using them.
import './styles/dashboard.css';
// .modal-* — the shared Modal shell.
import '@/core/ui/styles/modal.css';
// The shared UI vocabulary — 19 small families. Seven of the eight entries.
import '@/core/ui/styles/shared-ui.css';
// .icon-* — the icon-above-label pattern.
import '@/core/ui/styles/icon-label.css';
// .integrations-* — the integrations surface shell and grid.
import './styles/integrations.css';
// .db-* — the shared detail drawer.
import '@/core/ui/styles/drawer.css';
// .two-* — the shared two-column layout's stacking breakpoint.
import '@/core/ui/styles/two-column-layout.css';
// .inline-notice-*, .inline-rename-* — two small shared components.
import '@/core/ui/styles/inline-controls.css';

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
            // owned by ProjectDashboardWebviewCommand.getInitialData().
            const init = (data ?? {}) as ProjectDashboardScreenProps;
            return <ProjectDashboardScreen {...init} />;
        }}
    </WebviewApp>,
);
