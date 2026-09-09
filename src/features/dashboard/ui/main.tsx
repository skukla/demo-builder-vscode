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
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
// .ai-* rules, moved out of custom-spectrum.css by the CSS migration. Three
// entries reach a component using them, so all three import it.
import './styles/ai.css';
// .dashboard-* rules, moved out of custom-spectrum.css by the same migration.
// This is the ONLY entry whose graph reaches a component using them.
import './styles/dashboard.css';
// .modal-* — the shared Modal shell.
import '@/core/ui/styles/modal.css';

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
