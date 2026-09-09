import { View } from '@adobe/react-spectrum';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WizardContainer } from './WizardContainer';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/wizard.css';
import '@/core/ui/styles/custom-spectrum.css';
// .datapack-* rules, moved out of custom-spectrum.css by the CSS migration.
// The wizard and the data installer both render a component using them; kept
// separate from data-installer.css so the wizard does not drag in that
// surface's unrelated rules.
import '@/features/data-installer/ui/styles/datapack.css';
// The .prerequisite-* rules, moved out of custom-spectrum.css by the CSS
// migration (.rptc/plans/css-architecture-migration). The wizard is the only
// entry whose import graph reaches PrerequisitesStep.
import '@/features/prerequisites/ui/styles/prerequisites.css';
// .brand-* and .expandable-* rules, moved out of custom-spectrum.css by the CSS
// migration. They share a sheet because `.expandable-brand-card` IS a brand card,
// not because they could not be separated — the refusal that forced them to move
// together was a false one (corrected 2026-09-09). The wizard is the only entry
// whose graph reaches a component using either.
import '../styles/brand-cards.css';
// .int-* (integration flow) and .sum-* (build summary), moved out of
// custom-spectrum.css by the CSS migration. Wizard-only families.
import '../styles/integration-flow.css';
import '../styles/build-summary.css';
// .intflow-* — the Add Integration modal. TWO entries render it; the dedicated
// integrations surface imports this same sheet.
import '../styles/add-integration-flow.css';
// .timeline-* and .wizard-* — the SETUP PROGRESS rail and the wizard shell,
// including the rail-collapse breakpoint. Wizard-only.
import '../styles/wizard-timeline.css';
import type { WizardInitialData } from '@/types/webviewPayloads';

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
// Note: StrictMode removed to prevent double-execution of effects in development
// This was causing 3x handler execution and noisy logs. See research findings.
root.render(
    <WebviewApp
        // The ONLY panel with post-handshake work to ask for: `ready` makes the
        // extension load the component definitions the selection steps need.
        notifyReady
        onInit={(_data) => {
            // Initialization complete
        }}
        loadingContent={
            <View padding="size-400">
                <div>Initializing...</div>
            </View>
        }
    >
        {(data) => {
            // ONE boundary cast: the shape is owned by
            // CreateProjectWebviewCommand.getInitialData(). Partial because
            // `data` is null until the init message lands. Wire `null`s become
            // `undefined` where a container prop models absence that way.
            const init = (data ?? {}) as Partial<WizardInitialData>;
            return (
                <WizardContainer
                    componentDefaults={init.componentDefaults ?? undefined}
                    wizardSteps={init.wizardSteps ?? undefined}
                    existingProjectNames={init.existingProjectNames}
                    importedSettings={init.importedSettings}
                    editProject={init.editProject ?? undefined}
                    projectsViewMode={init.projectsViewMode}
                    blockLibraryDefaults={init.blockLibraryDefaults}
                    customBlockLibraryDefaults={init.customBlockLibraryDefaults}
                />
            );
        }}
    </WebviewApp>,
);
